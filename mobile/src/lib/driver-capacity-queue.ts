import * as SQLite from 'expo-sqlite';

export type CapacityLogEntry = {
  clientId: string;
  type: 'reset' | 'log';
  fillLevelPct: number;
  loggedAt: string;
};

const DATABASE_NAME = 'resiklean.db';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_capacity_queue (
          client_id TEXT PRIMARY KEY NOT NULL,
          type TEXT NOT NULL,
          fill_level_pct REAL NOT NULL,
          logged_at TEXT NOT NULL
        );
      `);
      return database;
    });
  }
  return databasePromise;
};

export const queueCapacityLog = async (log: CapacityLogEntry) => {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ client_id: string }>(
    'SELECT client_id FROM driver_capacity_queue WHERE client_id = ?',
    log.clientId,
  );
  if (existing) return;

  await database.runAsync(
    `INSERT INTO driver_capacity_queue (client_id, type, fill_level_pct, logged_at) VALUES (?, ?, ?, ?)`,
    log.clientId,
    log.type,
    log.fillLevelPct,
    log.loggedAt
  );
};

export const syncCapacityQueue = async (token: string) => {
  const API_URL = process.env.EXPO_PUBLIC_API_URL;
  if (!API_URL) return;

  const database = await getDatabase();
  const rows = await database.getAllAsync<{ client_id: string; type: 'reset' | 'log'; fill_level_pct: number; logged_at: string }>(
    'SELECT client_id, type, fill_level_pct, logged_at FROM driver_capacity_queue ORDER BY logged_at ASC'
  );

  if (rows.length === 0) return;

  const logs: CapacityLogEntry[] = rows.map(row => ({
    clientId: row.client_id,
    type: row.type,
    fillLevelPct: row.fill_level_pct,
    loggedAt: row.logged_at
  }));

  const res = await fetch(`${API_URL}/collector/capacity/batch-sync`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ logs }),
  });

  if (res.ok) {
    // Only delete the logs we just successfully synced
    const placeholders = logs.map(() => '?').join(',');
    const clientIds = logs.map(l => l.clientId);
    await database.runAsync(`DELETE FROM driver_capacity_queue WHERE client_id IN (${placeholders})`, ...clientIds);
  }
};
