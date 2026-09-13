import NetInfo from '@react-native-community/netinfo';
import * as Crypto from 'expo-crypto';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'resiklean-driver-logs.db';
const BATCH_SIZE = 50;

type QueueRow = {
  client_id: string;
  collector_id: string;
  stop_id: string;
  collected_at: string;
  exited_at: string;
  dwell_seconds: number;
  latitude: number;
  longitude: number;
  attempts: number;
};

type EntryRow = {
  stop_id: string;
  entered_at: string;
};

type BatchResponse = {
  success?: boolean;
  data?: {
    syncedIds?: string[];
    details?: {
      skipped?: Array<{ clientId?: string | null; reason?: string }>;
    };
  };
  error?: string;
};

export type DriverRouteLog = {
  clientId: string;
  stopId: string;
  collectedAt: string;
  exitedAt: string;
  dwellSeconds: number;
  latitude: number;
  longitude: number;
};

export type RouteLogQueueStats = {
  pending: number;
  failed: number;
};

export type RouteLogSyncResult = RouteLogQueueStats & {
  synced: number;
};

export type RouteLogSyncContext = {
  apiUrl: string;
  token: string;
  collectorId: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let syncInFlight: Promise<RouteLogSyncResult> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_geofence_entries (
          stop_id TEXT PRIMARY KEY NOT NULL,
          entered_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS driver_route_log_queue (
          client_id TEXT PRIMARY KEY NOT NULL,
          collector_id TEXT NOT NULL,
          stop_id TEXT NOT NULL,
          collected_at TEXT NOT NULL,
          exited_at TEXT NOT NULL,
          dwell_seconds INTEGER NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS driver_route_log_queue_owner_idx
          ON driver_route_log_queue (collector_id, created_at);
      `);
      return database;
    });
  }

  return databasePromise;
};

const toRouteLog = (row: QueueRow): DriverRouteLog => ({
  clientId: row.client_id,
  stopId: row.stop_id,
  collectedAt: row.collected_at,
  exitedAt: row.exited_at,
  dwellSeconds: row.dwell_seconds,
  latitude: row.latitude,
  longitude: row.longitude,
});

const getQueueRows = async (collectorId: string, limit?: number) => {
  const database = await getDatabase();
  const suffix = limit ? ` LIMIT ${limit}` : '';
  return database.getAllAsync<QueueRow>(
    `SELECT client_id, collector_id, stop_id, collected_at, exited_at, dwell_seconds, latitude, longitude, attempts
     FROM driver_route_log_queue
     WHERE collector_id = ?
     ORDER BY created_at ASC${suffix}`,
    collectorId,
  );
};

const getStats = async (collectorId: string): Promise<RouteLogQueueStats> => {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ pending: number; failed: number }>(
    `SELECT COUNT(*) AS pending,
            COALESCE(SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS failed
     FROM driver_route_log_queue
     WHERE collector_id = ?`,
    collectorId,
  );

  return { pending: row?.pending || 0, failed: row?.failed || 0 };
};

const markFailed = async (clientIds: string[], error: string) => {
  if (!clientIds.length) return;

  const database = await getDatabase();
  await Promise.all(clientIds.map((clientId) => database.runAsync(
    `UPDATE driver_route_log_queue
     SET attempts = attempts + 1, last_error = ?
     WHERE client_id = ?`,
    error,
    clientId,
  )));
};

const deleteQueuedLogs = async (clientIds: string[]) => {
  if (!clientIds.length) return;

  const database = await getDatabase();
  await Promise.all(clientIds.map((clientId) => database.runAsync(
    'DELETE FROM driver_route_log_queue WHERE client_id = ?',
    clientId,
  )));
};

const syncQueue = async ({ apiUrl, token, collectorId }: RouteLogSyncContext): Promise<RouteLogSyncResult> => {
  const before = await getStats(collectorId);
  if (!before.pending) return { ...before, synced: 0 };

  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) {
    return { ...before, synced: 0 };
  }

  let synced = 0;

  while (true) {
    const rows = await getQueueRows(collectorId, BATCH_SIZE);
    if (!rows.length) return { ...(await getStats(collectorId)), synced };

    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/collector/route/logs/batch`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        // dwellSeconds is included for the local audit trail; the backend recomputes it.
        body: JSON.stringify({ logs: rows.map(toRouteLog) }),
      });
      const payload = await response.json().catch(() => ({} as BatchResponse)) as BatchResponse;

      if (!response.ok || !payload.success) {
        await markFailed(rows.map((row) => row.client_id), payload.error || `Sync failed (${response.status}).`);
        return { ...(await getStats(collectorId)), synced };
      }

      // The backend reports fresh inserts in syncedIds. It reports a safe retry
      // of an already-created UUID as a skipped duplicate, which is also final.
      const confirmedIds = new Set(payload.data?.syncedIds || []);
      const duplicateIds = (payload.data?.details?.skipped || [])
        .filter((item) => item.reason === 'duplicate' && typeof item.clientId === 'string')
        .map((item) => item.clientId as string);
      duplicateIds.forEach((clientId) => confirmedIds.add(clientId));
      const submittedIds = new Set(rows.map((row) => row.client_id));
      const confirmed = [...confirmedIds].filter((clientId) => submittedIds.has(clientId));
      await deleteQueuedLogs(confirmed);
      synced += confirmed.length;

      const skippedReasons = new Map(
        (payload.data?.details?.skipped || [])
          .filter((item) => typeof item.clientId === 'string' && item.reason !== 'duplicate')
          .map((item) => [item.clientId as string, item.reason || 'The server skipped this log.']),
      );
      await Promise.all([...skippedReasons].map(([clientId, reason]) => markFailed([clientId], reason)));

      // If nothing was confirmed, the remaining records need correction rather
      // than an immediate retry; this also prevents an infinite sync loop.
      if (!confirmed.length) return { ...(await getStats(collectorId)), synced };
    } catch {
      await markFailed(rows.map((row) => row.client_id), 'Waiting for a network connection.');
      return { ...(await getStats(collectorId)), synced };
    }
  }
};

export async function recordGeofenceEntry(stopId: string, enteredAt = new Date().toISOString()) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_geofence_entries (stop_id, entered_at)
     VALUES (?, ?)
     ON CONFLICT(stop_id) DO UPDATE SET entered_at = excluded.entered_at`,
    stopId,
    enteredAt,
  );
}

export async function getGeofenceEntry(stopId: string) {
  const database = await getDatabase();
  const entry = await database.getFirstAsync<EntryRow>(
    'SELECT stop_id, entered_at FROM driver_geofence_entries WHERE stop_id = ?',
    stopId,
  );
  if (!entry) return null;

  return { stopId: entry.stop_id, collectedAt: entry.entered_at };
}

export async function deleteGeofenceEntry(stopId: string) {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM driver_geofence_entries WHERE stop_id = ?', stopId);
}

export async function clearGeofenceEntries() {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM driver_geofence_entries');
}

export async function queueRouteLog({
  collectorId,
  stopId,
  collectedAt,
  exitedAt,
  latitude,
  longitude,
}: Omit<DriverRouteLog, 'clientId' | 'dwellSeconds'> & { collectorId: string }) {
  const dwellSeconds = Math.max(0, Math.round((new Date(exitedAt).getTime() - new Date(collectedAt).getTime()) / 1000));
  const routeLog: DriverRouteLog = {
    clientId: Crypto.randomUUID(),
    stopId,
    collectedAt,
    exitedAt,
    dwellSeconds,
    latitude,
    longitude,
  };
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_route_log_queue
       (client_id, collector_id, stop_id, collected_at, exited_at, dwell_seconds, latitude, longitude, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    routeLog.clientId,
    collectorId,
    routeLog.stopId,
    routeLog.collectedAt,
    routeLog.exitedAt,
    routeLog.dwellSeconds,
    routeLog.latitude,
    routeLog.longitude,
    new Date().toISOString(),
  );

  return routeLog;
}

export function getRouteLogQueueStats(collectorId: string) {
  return getStats(collectorId);
}

export function syncRouteLogQueue(context: RouteLogSyncContext) {
  if (!syncInFlight) {
    syncInFlight = syncQueue(context).finally(() => { syncInFlight = null; });
  }

  return syncInFlight;
}

export function subscribeToRouteLogSync(context: RouteLogSyncContext, onSync?: (result: RouteLogSyncResult) => void) {
  const sync = async () => {
    const result = await syncRouteLogQueue(context);
    onSync?.(result);
  };

  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) {
      void sync();
    }
  });
  void sync();

  return unsubscribe;
}
