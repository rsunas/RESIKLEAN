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
