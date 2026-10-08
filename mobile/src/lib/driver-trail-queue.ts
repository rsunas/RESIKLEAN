import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'resiklean-driver-trail.db';
const SESSION_BATCH_SIZE = 3;

export type DriverTrailLocation = {
  timestamp?: number;
  coords: {
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    altitude?: number | null;
    heading?: number | null;
    speed?: number | null;
  };
};

type TrailSessionRow = {
  client_session_id: string;
  collector_id: string;
  route_id: string;
  route_name: string;
  started_at: string;
  ended_at: string | null;
  status: 'active' | 'completed';
  attempts: number;
  last_error: string | null;
  sync_version: number;
};

type TrailPointRow = {
  client_id: string;
  client_session_id: string;
  collector_id: string;
  route_id: string;
  route_name: string;
  recorded_at: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number | null;
  altitude_meters: number | null;
  heading_degrees: number | null;
  speed_mps: number | null;
};

type TrailSessionPayload = {
  clientSessionId: string;
  collectorId: string;
  routeId: string;
  routeName: string;
  startedAt: string;
  endedAt?: string | null;
  status: 'active' | 'completed';
  points: Array<{
    clientId: string;
    recordedAt: string;
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    altitudeMeters?: number | null;
    headingDegrees?: number | null;
    speedMetersPerSecond?: number | null;
  }>;
};

type TrailBatchResponse = {
  success?: boolean;
  data?: {
    syncedSessionIds?: string[];
    syncedPointIds?: string[];
    rejectedSessions?: Array<{ clientSessionId?: string; reason?: string }>;
  };
  error?: string;
};

export type DriverTrailQueueStats = {
  pendingSessions: number;
  pendingPoints: number;
  failedSessions: number;
};

export type DriverTrailSyncResult = DriverTrailQueueStats & {
  syncedSessions: number;
  syncedPoints: number;
};

export type DriverTrailSyncContext = {
  apiUrl: string;
  token: string;
  collectorId: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let syncInFlight: Promise<DriverTrailSyncResult> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_trail_sessions (
          client_session_id TEXT PRIMARY KEY NOT NULL,
          collector_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          route_name TEXT NOT NULL,
          started_at TEXT NOT NULL,
          ended_at TEXT,
          status TEXT NOT NULL DEFAULT 'active',
          synced_at TEXT,
          sync_version INTEGER NOT NULL DEFAULT 0,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT
        );
        CREATE INDEX IF NOT EXISTS driver_trail_sessions_owner_idx
          ON driver_trail_sessions (collector_id, synced_at, started_at);
        CREATE TABLE IF NOT EXISTS driver_trail_points (
          client_id TEXT PRIMARY KEY NOT NULL,
          client_session_id TEXT NOT NULL,
          collector_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          route_name TEXT NOT NULL,
          recorded_at TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          accuracy_meters REAL,
          altitude_meters REAL,
          heading_degrees REAL,
          speed_mps REAL,
          created_at TEXT NOT NULL,
          UNIQUE(client_session_id, recorded_at)
        );
        CREATE INDEX IF NOT EXISTS driver_trail_points_session_idx
          ON driver_trail_points (client_session_id, recorded_at);
      `);
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(driver_trail_sessions)');
      if (!columns.some((column) => column.name === 'sync_version')) {
        await database.execAsync('ALTER TABLE driver_trail_sessions ADD COLUMN sync_version INTEGER NOT NULL DEFAULT 0');
      }
      return database;
    });
  }

  return databasePromise;
};

const validCoordinate = (latitude: number, longitude: number) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && Math.abs(latitude) <= 90
  && Math.abs(longitude) <= 180
);

const toIsoTimestamp = (timestamp?: number) => {
  const date = timestamp ? new Date(timestamp) : new Date();
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const getStats = async (collectorId: string): Promise<DriverTrailQueueStats> => {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DriverTrailQueueStats>(
    `SELECT
       COUNT(*) AS pendingSessions,
       COALESCE((SELECT COUNT(*) FROM driver_trail_points p
         INNER JOIN driver_trail_sessions s ON s.client_session_id = p.client_session_id
         WHERE s.collector_id = ? AND s.synced_at IS NULL), 0) AS pendingPoints,
       COALESCE(SUM(CASE WHEN attempts > 0 THEN 1 ELSE 0 END), 0) AS failedSessions
     FROM driver_trail_sessions
     WHERE collector_id = ? AND synced_at IS NULL`,
    collectorId,
    collectorId,
  );

  return {
    pendingSessions: row?.pendingSessions || 0,
    pendingPoints: row?.pendingPoints || 0,
    failedSessions: row?.failedSessions || 0,
  };
};

export async function startDriverTrailSession({ collectorId, routeId, routeName }: { collectorId: string; routeId: string; routeName: string }) {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ client_session_id: string }>(
    `SELECT client_session_id FROM driver_trail_sessions
     WHERE collector_id = ? AND route_id = ? AND status = 'active'
     ORDER BY started_at DESC LIMIT 1`,
    collectorId,
    routeId,
  );
  if (existing) return existing.client_session_id;

  // A device can monitor only one assigned route at a time. Completing an old
  // session keeps its points available for sync while preventing mixed trails.
  await database.runAsync(
    `UPDATE driver_trail_sessions
     SET status = 'completed', ended_at = COALESCE(ended_at, ?), synced_at = NULL, sync_version = sync_version + 1
     WHERE collector_id = ? AND status = 'active'`,
    new Date().toISOString(),
    collectorId,
  );

  const clientSessionId = Crypto.randomUUID();
  await database.runAsync(
    `INSERT INTO driver_trail_sessions
       (client_session_id, collector_id, route_id, route_name, started_at, status)
     VALUES (?, ?, ?, ?, ?, 'active')`,
    clientSessionId,
    collectorId,
    routeId,
    routeName,
    new Date().toISOString(),
  );
  return clientSessionId;
}

export async function recordDriverTrailLocation(location: DriverTrailLocation, collectorId?: string | null) {
  const { latitude, longitude, accuracy, altitude, heading, speed } = location.coords;
  if (!validCoordinate(latitude, longitude)) return false;

  const database = await getDatabase();
  const session = await database.getFirstAsync<TrailSessionRow>(
    `SELECT client_session_id, collector_id, route_id, route_name, started_at, ended_at, status, attempts, last_error
     FROM driver_trail_sessions
     WHERE status = 'active' AND (? IS NULL OR collector_id = ?)
     ORDER BY started_at DESC LIMIT 1`,
    collectorId ?? null,
    collectorId ?? null,
  );
  if (!session) return false;

  const recordedAt = toIsoTimestamp(location.timestamp);
  await database.runAsync(
    `INSERT OR IGNORE INTO driver_trail_points
       (client_id, client_session_id, collector_id, route_id, route_name, recorded_at,
        latitude, longitude, accuracy_meters, altitude_meters, heading_degrees, speed_mps, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Crypto.randomUUID(),
    session.client_session_id,
    session.collector_id,
    session.route_id,
    session.route_name,
    recordedAt,
    latitude,
    longitude,
    typeof accuracy === 'number' && Number.isFinite(accuracy) ? accuracy : null,
    typeof altitude === 'number' && Number.isFinite(altitude) ? altitude : null,
    typeof heading === 'number' && Number.isFinite(heading) ? heading : null,
    typeof speed === 'number' && Number.isFinite(speed) ? speed : null,
    new Date().toISOString(),
  );
  await database.runAsync(
    `UPDATE driver_trail_sessions
     SET synced_at = NULL, last_error = NULL, sync_version = sync_version + 1
     WHERE client_session_id = ?`,
    session.client_session_id,
  );
  return true;
}

export async function finishDriverTrailSession() {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE driver_trail_sessions
     SET status = 'completed', ended_at = COALESCE(ended_at, ?), synced_at = NULL, sync_version = sync_version + 1
     WHERE status = 'active'`,
    new Date().toISOString(),
  );
}

const getPendingSessions = async (collectorId: string) => {
  const database = await getDatabase();
  const sessions = await database.getAllAsync<TrailSessionRow>(
    `SELECT client_session_id, collector_id, route_id, route_name, started_at, ended_at, status, attempts, last_error, sync_version
     FROM driver_trail_sessions
     WHERE collector_id = ? AND synced_at IS NULL
     ORDER BY started_at ASC LIMIT ${SESSION_BATCH_SIZE}`,
    collectorId,
  );

  const payload: TrailSessionPayload[] = [];
  for (const session of sessions) {
    const points = await database.getAllAsync<TrailPointRow>(
      `SELECT client_id, client_session_id, collector_id, route_id, route_name, recorded_at,
              latitude, longitude, accuracy_meters, altitude_meters, heading_degrees, speed_mps
       FROM driver_trail_points WHERE client_session_id = ? ORDER BY recorded_at ASC`,
      session.client_session_id,
    );
    payload.push({
      clientSessionId: session.client_session_id,
      collectorId: session.collector_id,
      routeId: session.route_id,
      routeName: session.route_name,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      status: session.status,
      points: points.map((point) => ({
        clientId: point.client_id,
        recordedAt: point.recorded_at,
        latitude: point.latitude,
        longitude: point.longitude,
        accuracyMeters: point.accuracy_meters,
        altitudeMeters: point.altitude_meters,
        headingDegrees: point.heading_degrees,
        speedMetersPerSecond: point.speed_mps,
      })),
    });
  }
  return { sessions, payload };
};

const markFailed = async (sessionIds: string[], error: string) => {
  if (!sessionIds.length) return;
  const database = await getDatabase();
  await Promise.all(sessionIds.map((sessionId) => database.runAsync(
    `UPDATE driver_trail_sessions SET attempts = attempts + 1, last_error = ? WHERE client_session_id = ?`,
    error,
    sessionId,
  )));
};

const markSynced = async (sessions: TrailSessionRow[]) => {
  if (!sessions.length) return 0;
  const database = await getDatabase();
  const results = await Promise.all(sessions.map((session) => database.runAsync(
    // A point or completion recorded while this request was in flight bumps
    // sync_version, leaving the session pending for the next sync instead of
    // accidentally marking newer local data as synchronized.
    `UPDATE driver_trail_sessions
     SET synced_at = ?, last_error = NULL
     WHERE client_session_id = ? AND sync_version = ?`,
    new Date().toISOString(),
    session.client_session_id,
    session.sync_version,
  )));
  return results.reduce((count, result) => count + (result.changes ? 1 : 0), 0);
};

const syncQueue = async ({ apiUrl, token, collectorId }: DriverTrailSyncContext): Promise<DriverTrailSyncResult> => {
  const before = await getStats(collectorId);
  if (!before.pendingSessions) return { ...before, syncedSessions: 0, syncedPoints: 0 };

  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    return { ...before, syncedSessions: 0, syncedPoints: 0 };
  }

  let syncedSessions = 0;
  let syncedPoints = 0;
  while (true) {
    const { sessions, payload: sessionsPayload } = await getPendingSessions(collectorId);
    if (!sessions.length) return { ...(await getStats(collectorId)), syncedSessions, syncedPoints };

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/collector/trails/batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessions: sessionsPayload }),
      });
      const result = await response.json().catch(() => ({} as TrailBatchResponse)) as TrailBatchResponse;
      if (!response.ok || !result.success) {
        await markFailed(sessions.map((session) => session.client_session_id), result.error || `Trail sync failed (${response.status}).`);
        return { ...(await getStats(collectorId)), syncedSessions, syncedPoints };
      }

      const confirmedSessions = new Set(result.data?.syncedSessionIds || []);
      const submittedSessions = new Set(sessions.map((session) => session.client_session_id));
      const confirmed = [...confirmedSessions].filter((id) => submittedSessions.has(id));
      const markedSessions = await markSynced(sessions.filter((session) => confirmed.includes(session.client_session_id)));
      syncedSessions += markedSessions;
      syncedPoints += result.data?.syncedPointIds?.length || 0;
      const rejected = new Map((result.data?.rejectedSessions || [])
        .filter((item) => typeof item.clientSessionId === 'string')
        .map((item) => [item.clientSessionId as string, item.reason || 'The server could not store this trail session.']));
      await Promise.all([...rejected].map(([sessionId, reason]) => markFailed([sessionId], reason)));
      if (!confirmed.length) return { ...(await getStats(collectorId)), syncedSessions, syncedPoints };
    } catch {
      await markFailed(sessions.map((session) => session.client_session_id), 'Waiting for a network connection.');
      return { ...(await getStats(collectorId)), syncedSessions, syncedPoints };
    }
  }
};

export function getDriverTrailQueueStats(collectorId: string) {
  return getStats(collectorId);
}

export function syncDriverTrailQueue(context: DriverTrailSyncContext) {
  if (!syncInFlight) syncInFlight = syncQueue(context).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export function subscribeToDriverTrailSync(context: DriverTrailSyncContext, onSync?: (result: DriverTrailSyncResult) => void) {
  const sync = async () => onSync?.(await syncDriverTrailQueue(context));
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void sync();
  });
  void sync();
  return unsubscribe;
}
