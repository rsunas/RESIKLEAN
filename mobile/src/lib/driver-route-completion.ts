import NetInfo from '@react-native-community/netinfo';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'resiklean-driver-route-tracking.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

export type QueuedCompletion = {
  routeId: string;
  collectorId: string;
  queuedAt: string;
};

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (db) => {
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_route_completions (
          route_id TEXT NOT NULL,
          collector_id TEXT NOT NULL,
          queued_at TEXT NOT NULL,
          PRIMARY KEY (route_id, collector_id)
        );
      `);
      return db;
    });
  }
  return databasePromise;
};

export async function queueRouteCompletion(routeId: string, collectorId: string): Promise<void> {
  if (!routeId || !collectorId) return;
  try {
    const db = await getDatabase();
    await db.runAsync(
      `INSERT INTO driver_route_completions (route_id, collector_id, queued_at)
       VALUES (?, ?, ?)
       ON CONFLICT(route_id, collector_id) DO UPDATE SET queued_at = excluded.queued_at`,
      routeId,
      collectorId,
      new Date().toISOString(),
    );
  } catch (err) {
    console.warn('Failed to queue route completion in SQLite:', err);
  }
}

export async function getQueuedRouteCompletions(collectorId: string): Promise<QueuedCompletion[]> {
  if (!collectorId) return [];
  try {
    const db = await getDatabase();
    const rows = await db.getAllAsync<{ route_id: string; collector_id: string; queued_at: string }>(
      `SELECT route_id, collector_id, queued_at FROM driver_route_completions
       WHERE collector_id = ?
       ORDER BY queued_at ASC`,
      collectorId,
    );
    return rows.map((r) => ({
      routeId: r.route_id,
      collectorId: r.collector_id,
      queuedAt: r.queued_at,
    }));
  } catch (err) {
    console.warn('Failed to get queued route completions from SQLite:', err);
    return [];
  }
}

export async function isRouteCompletionQueued(routeId: string, collectorId: string): Promise<boolean> {
  if (!routeId || !collectorId) return false;
  try {
    const db = await getDatabase();
    const row = await db.getFirstAsync<{ route_id: string }>(
      `SELECT route_id FROM driver_route_completions WHERE route_id = ? AND collector_id = ?`,
      routeId,
      collectorId,
    );
    return Boolean(row);
  } catch {
    return false;
  }
}

export async function syncRouteCompletions(apiUrl: string, token: string, collectorId: string): Promise<number> {
  if (!apiUrl || !token || !collectorId) return 0;
  const network = await NetInfo.fetch().catch(() => ({ isConnected: false, isInternetReachable: false }));
  if (!network.isConnected || network.isInternetReachable === false) return 0;

  const pending = await getQueuedRouteCompletions(collectorId);
  if (!pending.length) return 0;

  let synced = 0;
  const db = await getDatabase();
  for (const item of pending) {
    try {
      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/collector/route/complete`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ routeId: item.routeId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok && payload.success) {
        await db.runAsync(
          `DELETE FROM driver_route_completions WHERE route_id = ? AND collector_id = ?`,
          item.routeId,
          item.collectorId,
        );
        synced += 1;
      } else if (response.status === 400 || response.status === 404) {
        // Already completed or invalid on server - remove from queue so it does not block future completions
        await db.runAsync(
          `DELETE FROM driver_route_completions WHERE route_id = ? AND collector_id = ?`,
          item.routeId,
          item.collectorId,
        );
      }
    } catch {
      break;
    }
  }
  return synced;
}

export function subscribeToRouteCompletionSync(apiUrl: string, token: string, collectorId: string, onSync?: () => void) {
  let isSyncing = false;
  const sync = async () => {
    if (isSyncing) return;
    isSyncing = true;
    try {
      const synced = await syncRouteCompletions(apiUrl, token, collectorId);
      if (synced > 0) onSync?.();
    } finally {
      isSyncing = false;
    }
  };
  const subscription = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void sync();
  });
  void sync();
  return subscription;
}
