import * as SQLite from 'expo-sqlite';
import { requestJson } from './network-request';

export type CapacityContext = { collectorId: string; cycleLogId: string; routeId: string; truckId: string };
export type CapacityLogEntry = CapacityContext & {
  clientId: string;
  type: 'reset' | 'log';
  fillLevelPct: number;
  loggedAt: string;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const inFlight = new Map<string, Promise<void>>();
const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync('resiklean.db').then(async database => {
      // Legacy entries lack ownership; keep them intact instead of assigning them to the wrong driver.
      await database.execAsync(`CREATE TABLE IF NOT EXISTS driver_capacity_events (
        client_id TEXT PRIMARY KEY NOT NULL, collector_id TEXT NOT NULL,
        cycle_id TEXT NOT NULL, route_id TEXT NOT NULL, truck_id TEXT NOT NULL,
        type TEXT NOT NULL, fill_level_pct REAL NOT NULL, logged_at TEXT NOT NULL,
        synced INTEGER NOT NULL DEFAULT 0
      );`);
      return database;
    }).catch(error => { databasePromise = null; throw error; });
  }
  return databasePromise;
};

export async function queueCapacityLog(log: CapacityLogEntry) {
  const database = await getDatabase();
  await database.runAsync(`INSERT OR IGNORE INTO driver_capacity_events
    (client_id, collector_id, cycle_id, route_id, truck_id, type, fill_level_pct, logged_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, log.clientId, log.collectorId, log.cycleLogId,
    log.routeId, log.truckId, log.type, log.fillLevelPct, log.loggedAt);
}

export async function getLocalCapacityReset(context: CapacityContext) {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ logged_at: string }>(`SELECT logged_at FROM driver_capacity_events
    WHERE collector_id = ? AND cycle_id = ? AND truck_id = ? AND type = 'reset'
    ORDER BY logged_at DESC LIMIT 1`, context.collectorId, context.cycleLogId, context.truckId);
  return row ? Date.parse(row.logged_at) || 0 : 0;
}

async function sync(token: string, collectorId: string) {
  const apiUrl = process.env.EXPO_PUBLIC_API_URL;
  if (!apiUrl) return;
  const database = await getDatabase();
  const rows = await database.getAllAsync<{
    client_id: string; collector_id: string; cycle_id: string; route_id: string; truck_id: string;
    type: 'reset' | 'log'; fill_level_pct: number; logged_at: string;
  }>('SELECT * FROM driver_capacity_events WHERE collector_id = ? AND synced = 0 ORDER BY logged_at DESC LIMIT 50', collectorId);
  if (!rows.length) return;
  const logs = rows.map(row => ({ clientId: row.client_id, cycleLogId: row.cycle_id,
    routeId: row.route_id, truckId: row.truck_id, type: row.type,
    fillLevelPct: row.fill_level_pct, loggedAt: row.logged_at }));
  const { response, payload } = await requestJson<{ success?: boolean; error?: string; data?: { syncedIds?: string[] } }>(`${apiUrl}/collector/capacity/batch-sync`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ logs }),
  });
  if (!response.ok || !payload.success) throw new Error(payload.error || 'Capacity sync failed');
  const accepted = new Set(payload.data?.syncedIds || []);
  for (const row of rows) {
    if (accepted.has(row.client_id)) {
      // Keep acknowledged resets locally so reopening offline cannot refill the truck.
      await database.runAsync('UPDATE driver_capacity_events SET synced = 1 WHERE client_id = ? AND collector_id = ?', row.client_id, collectorId);
    }
  }
}

export function syncCapacityQueue(token: string, collectorId: string) {
  const current = inFlight.get(collectorId);
  if (current) return current;
  const task = sync(token, collectorId).finally(() => { inFlight.delete(collectorId); });
  inFlight.set(collectorId, task);
  return task;
}
