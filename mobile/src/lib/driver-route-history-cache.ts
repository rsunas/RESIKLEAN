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
type HistoryMapRecord = {id: string; date: string; routeId: string; routePath?: HistoryPath | null; trailPath?: HistoryPath | null; pendingSync?: boolean; sessionStartedAt?: string; sessionEndedAt?: string};
/** Merge by route/day, keeping separate trips separate and never erasing local paths. */
export function mergeRouteHistory<T extends HistoryMapRecord>(primary: T[], fallback: T[]): T[] {
  const groups = new Map<string, T>();
  const lines = (path?: HistoryPath | null): unknown[] => !path || !Array.isArray(path.coordinates) ? [] : path.type === 'LineString' ? [path.coordinates] : path.coordinates;
  for (const record of [...fallback, ...primary]) {
    const key = `${record.date}|${record.routeId}`;
    const previous = groups.get(key);
    if (!previous) { groups.set(key, record); continue; }
    const candidates = [...new Map([...lines(previous.trailPath), ...lines(record.trailPath)].map(line => [JSON.stringify(line), line])).values()];
    // A previously uploaded prefix must not accumulate as another drawn trip.
    const unique = candidates.filter(line => !candidates.some(other => other !== line && Array.isArray(other) && Array.isArray(line)
      && other.length > line.length && JSON.stringify(other).startsWith(JSON.stringify(line).slice(0, -1) + ',')));
    const trailPath: HistoryPath | undefined = unique.length > 1 ? {type: 'MultiLineString', coordinates: unique} : unique.length ? {type: 'LineString', coordinates: unique[0]} : undefined;
    const starts = [previous.sessionStartedAt, record.sessionStartedAt].filter((value): value is string => !!value).sort();
    const ends = [previous.sessionEndedAt, record.sessionEndedAt].filter((value): value is string => !!value).sort();
    groups.set(key, {...previous, ...record, routePath: record.routePath || previous.routePath, trailPath,
      sessionStartedAt: starts[0], sessionEndedAt: ends.at(-1), pendingSync: !!(previous.pendingSync || record.pendingSync)});
  }
  return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date));
}
