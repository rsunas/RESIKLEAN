import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'resiklean-driver-route-tracking.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_route_history_cache (
          collector_id TEXT PRIMARY KEY NOT NULL,
          history_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return db;
    });
  }
  return databasePromise;
};

export async function saveRouteHistoryCache<T>(collectorId: string, groups: T[]): Promise<void> {
  if (!collectorId) return;
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO driver_route_history_cache (collector_id, history_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(collector_id) DO UPDATE SET
         history_json = excluded.history_json,
         updated_at = excluded.updated_at`,
      collectorId,
      JSON.stringify(groups),
      new Date().toISOString(),
    );
  } catch (err) {
    console.warn('Failed to save route history cache in SQLite:', err);
  }
}

export async function getRouteHistoryCache<T>(collectorId: string): Promise<T[]> {
  if (!collectorId) return [];
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ history_json: string }>(
      `SELECT history_json FROM driver_route_history_cache WHERE collector_id = ?`,
      collectorId,
    );
    if (!row?.history_json) return [];
    const parsed = JSON.parse(row.history_json) as T[];
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.warn('Failed to get route history cache from SQLite:', err);
    return [];
  }
}

type HistoryPath = {type: 'LineString' | 'MultiLineString'; coordinates: unknown};
type HistoryMapRecord = {firstLocation?: [number, number] | null; firstRecordedAt?: string | null; lastLocation?: [number, number] | null; lastRecordedAt?: string | null; id: string; date: string; routeId: string; routePath?: HistoryPath | null; trailPath?: HistoryPath | null; pendingSync?: boolean; syncFailed?: boolean; sessionStartedAt?: string; sessionEndedAt?: string; routeSnapshot?: { name: string; routePath?: HistoryPath | null; barangay?: string[]; stops?: unknown[] } | null};
const validPoint = (point: unknown): point is [number, number] => Array.isArray(point)
  && typeof point[0] === 'number' && typeof point[1] === 'number'
  && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;

/** The saved final fix can be a lone point after a gap, outside drawable lines. */
export function historyTrailEndpoint(record: Pick<HistoryMapRecord, 'lastLocation' | 'trailPath'>): [number, number] | null {
  if (validPoint(record.lastLocation)) return record.lastLocation;
  if (record.lastLocation === null) return null;
  const path = record.trailPath;
  if (!Array.isArray(path?.coordinates)) return null;
  const points = path.type === 'MultiLineString' ? path.coordinates.flat() : path.coordinates;
  return [...points].reverse().find(validPoint) || null;
}

export function historyTrailStartpoint(record: Pick<HistoryMapRecord, 'firstLocation' | 'trailPath'>): [number, number] | null {
  if (validPoint(record.firstLocation)) return record.firstLocation;
  if (record.firstLocation === null) return null;
  const path = record.trailPath;
  if (!Array.isArray(path?.coordinates)) return null;
  const points = path.type === 'MultiLineString' ? path.coordinates.flat() : path.coordinates;
  return points.find(validPoint) || null;
}

export function historyTrailMarkers(record: Pick<HistoryMapRecord, 'firstLocation' | 'lastLocation' | 'trailPath' | 'sessionEndedAt'>) {
  const start = historyTrailStartpoint(record), end = historyTrailEndpoint(record);
  const endLabel = record.sessionEndedAt ? 'End' : 'Last GPS';
  if (start && end && start.every((value, index) => value === end[index])) return [{ point: start, label: 'Start / ' + endLabel }];
  return [...(start ? [{ point: start, label: 'Start' }] : []), ...(end ? [{ point: end, label: endLabel }] : [])];
}

/** Merge by route/day, keeping separate trips separate and never erasing local paths. */
export function mergeRouteHistory<T extends HistoryMapRecord>(primary: T[], fallback: T[]): T[] {
  const groups = new Map<string, T>();
  const lines = (path?: HistoryPath | null): unknown[] => !path || !Array.isArray(path.coordinates) ? [] : path.type === 'LineString' ? [path.coordinates] : path.coordinates;
  for (const record of [...fallback, ...primary]) {
    const key = `${record.date}|${record.routeId}`;
    const previous = groups.get(key);
    if (!previous) { groups.set(key, record); continue; }
    const pointTime = (item: T) => Date.parse(item.lastRecordedAt || item.sessionEndedAt || item.sessionStartedAt || '') || 0;
    const pointCount = (item: T) => lines(item.trailPath).reduce<number>((count, line) => count + (Array.isArray(line) ? line.length : 0), 0);
    // Legacy responses have only session timestamps. On a tie prefer the fuller
    // trail, so a partial upload cannot move the endpoint back to its old prefix.
    const hasEndTime = (item: T) => validPoint(item.lastLocation) && Number.isFinite(Date.parse(item.lastRecordedAt || ''));
    const latest = historyTrailEndpoint(record) && (!historyTrailEndpoint(previous)
      || (hasEndTime(record) && !hasEndTime(previous))
      || (hasEndTime(record) === hasEndTime(previous) && (pointTime(record) > pointTime(previous)
        || (pointTime(record) === pointTime(previous) && pointCount(record) > pointCount(previous))))) ? record : previous;
    const startTime = (item: T) => Date.parse(item.firstRecordedAt || item.sessionStartedAt || '') || Infinity;
    const hasStartTime = (item: T) => validPoint(item.firstLocation) && Number.isFinite(Date.parse(item.firstRecordedAt || ''));
    const earliest = historyTrailStartpoint(record) && (!historyTrailStartpoint(previous)
      || (hasStartTime(record) && !hasStartTime(previous))
      || (hasStartTime(record) === hasStartTime(previous) && (startTime(record) < startTime(previous)
        || (startTime(record) === startTime(previous) && validPoint(record.firstLocation) && !validPoint(previous.firstLocation))))) ? record : previous;
    const chronological = (Date.parse(previous.sessionStartedAt || '') || 0) <= (Date.parse(record.sessionStartedAt || '') || 0)
      ? [previous, record] : [record, previous];
    const candidates = [...new Map(chronological.flatMap(item => lines(item.trailPath)).map(line => [JSON.stringify(line), line])).values()];
    // A previously uploaded prefix must not accumulate as another drawn trip.
    const unique = candidates.filter(line => !candidates.some(other => other !== line && Array.isArray(other) && Array.isArray(line)
      && other.length > line.length && JSON.stringify(other).startsWith(JSON.stringify(line).slice(0, -1) + ',')));
    const trailPath: HistoryPath | undefined = unique.length > 1 ? {type: 'MultiLineString', coordinates: unique} : unique.length ? {type: 'LineString', coordinates: unique[0]} : undefined;
    const starts = [previous.sessionStartedAt, record.sessionStartedAt].filter((value): value is string => !!value).sort();
    const ends = [previous.sessionEndedAt, record.sessionEndedAt].filter((value): value is string => !!value).sort();
    // A saved trip snapshot outranks any live-route fields from older servers.
    // Prefer the snapshot that actually includes a path over a legacy name-only one.
    const routeSnapshot = record.routeSnapshot?.routePath ? record.routeSnapshot : previous.routeSnapshot?.routePath ? previous.routeSnapshot : record.routeSnapshot || previous.routeSnapshot;
    const pendingSync = !!(previous.pendingSync || record.pendingSync);
    groups.set(key, {...previous, ...record, routePath: routeSnapshot ? routeSnapshot.routePath || null : record.routePath || previous.routePath, trailPath,
      ...(routeSnapshot ? { routeSnapshot, routeName: routeSnapshot.name, barangay: routeSnapshot.barangay || [], ...(routeSnapshot.stops ? { totalStops: routeSnapshot.stops.length } : {}) } : {}),
      firstLocation: historyTrailStartpoint(earliest), firstRecordedAt: earliest.firstRecordedAt,
      lastLocation: historyTrailEndpoint(latest), lastRecordedAt: latest.lastRecordedAt,
      sessionStartedAt: starts[0], sessionEndedAt: ends.at(-1), pendingSync, syncFailed: pendingSync && !!(previous.syncFailed || record.syncFailed)});
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}
