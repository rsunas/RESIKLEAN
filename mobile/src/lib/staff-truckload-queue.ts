import NetInfo from '@react-native-community/netinfo';
import * as FileSystem from 'expo-file-system/legacy';
import * as SQLite from 'expo-sqlite';

const DATABASE_NAME = 'resiklean-staff-truckloads.db';
const PHOTO_DIRECTORY = 'staff-truckload-queue';

export type StaffQueuePhoto = {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  capturedAt: string;
};

export type StaffTruckloadQueueInput = {
  clientSubmissionId: string;
  staffId: string;
  truckPlate: string;
  routeId: string;
  area?: string;
  driver?: string;
  length: string;
  width: string;
  height: string;
  slope: string;
  notes: string;
  sidePhoto: StaffQueuePhoto;
  backPhoto: StaffQueuePhoto;
};

type QueuePayload = Omit<StaffTruckloadQueueInput, 'staffId'>;

type QueueRow = {
  client_id: string;
  staff_id: string;
  payload_json: string;
  side_photo_uri: string;
  back_photo_uri: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
};

export type QueuedStaffTruckloadRecord = {
  clientId: string;
  staffId: string;
  truckPlate: string;
  routeId: string;
  area?: string;
  driver?: string;
  length: string;
  width: string;
  height: string;
  slope: string;
  notes: string;
  sidePhotoUri: string;
  backPhotoUri: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

export type StaffQueueStats = {
  pending: number;
  failed: number;
};

export type StaffQueueSyncResult = StaffQueueStats & { synced: number };

export type StaffQueueSyncContext = {
  apiUrl: string;
  token: string;
  staffId: string;
};

// Default fallback reference data if the app is opened offline before any online sync
export const DEFAULT_FALLBACK_TRUCKS = [
  { plate: 'SWM-101', length: '4.2', width: '2.0', height: '1.8' },
  { plate: 'SWM-102', length: '4.5', width: '2.1', height: '1.9' },
  { plate: 'SWM-103', length: '4.0', width: '1.9', height: '1.7' },
  { plate: 'SWM-104', length: '5.0', width: '2.2', height: '2.0' },
  { plate: 'SWM-105', length: '3.8', width: '1.8', height: '1.6' },
];

export const DEFAULT_FALLBACK_AREAS = [
  { _id: 'area-1', barangay: 'Centro', name: 'Area 1 Collection Route' },
  { _id: 'area-2a', barangay: 'Bagumbayan Sur', name: 'Area 2A Collection Route' },
  { _id: 'area-2b', barangay: 'Bagumbayan Norte', name: 'Area 2B Collection Route' },
  { _id: 'area-3', barangay: 'Concepcion Pequeña', name: 'Area 3 Collection Route' },
  { _id: 'area-4', barangay: 'Concepcion Grande', name: 'Area 4 Collection Route' },
  { _id: 'area-5', barangay: 'Mabolo', name: 'Area 5 Collection Route' },
  { _id: 'area-6', barangay: 'Pactol', name: 'Area 6 Collection Route' },
  { _id: 'area-7', barangay: 'San Felipe', name: 'Area 7 Collection Route' },
  { _id: 'area-8', barangay: 'Cararayan', name: 'Area 8 Collection Route' },
];

export const DEFAULT_FALLBACK_DRIVERS = [
  'Juan Dela Cruz',
  'Pedro Santos',
  'Mark Ramos',
  'Reynaldo Reyes',
  'Carlos Garcia',
];

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
let syncInFlight: Promise<StaffQueueSyncResult> | null = null;

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS staff_truckload_queue (
          client_id TEXT PRIMARY KEY NOT NULL,
          staff_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          side_photo_uri TEXT NOT NULL,
          back_photo_uri TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS staff_truckload_queue_owner_idx
          ON staff_truckload_queue (staff_id, created_at);
        CREATE TABLE IF NOT EXISTS staff_offline_cache (
          key TEXT PRIMARY KEY NOT NULL,
          data_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      return database;
    });
  }

  return databasePromise;
};

export async function saveStaffCache<T>(key: string, data: T): Promise<void> {
  try {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO staff_offline_cache (key, data_json, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET
         data_json = excluded.data_json,
         updated_at = excluded.updated_at`,
      key,
      JSON.stringify(data),
      new Date().toISOString(),
    );
  } catch (error) {
    console.warn(`Failed to save staff cache for key "${key}":`, error);
  }
}

export async function getStaffCache<T>(key: string): Promise<T | null> {
  try {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ data_json: string }>(
      'SELECT data_json FROM staff_offline_cache WHERE key = ?',
      key,
    );
    if (!row?.data_json) return null;
    return JSON.parse(row.data_json) as T;
  } catch (error) {
    console.warn(`Failed to get staff cache for key "${key}":`, error);
    return null;
  }
}

const queueDirectory = () => {
  const documentDirectory = FileSystem.documentDirectory;
  if (!documentDirectory) throw new Error('Local storage is unavailable for offline staff submissions.');
  return `${documentDirectory}${PHOTO_DIRECTORY}/`;
};

const persistPhoto = async (photo: StaffQueuePhoto, clientId: string, slot: 'side' | 'back') => {
  const directory = queueDirectory();
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const extension = photo.fileName.split('.').pop()?.toLowerCase() || 'jpg';
  const target = `${directory}${clientId}-${slot}.${extension}`;
  await FileSystem.copyAsync({ from: photo.uri, to: target });
  return target;
};

const deletePhoto = async (uri: string) => {
  try {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  } catch {
    // A missing local file should not prevent the queue record from being removed.
  }
};

const photoMetadata = (photo: StaffQueuePhoto) => JSON.stringify({
  capturedAt: photo.capturedAt,
  width: photo.width,
  height: photo.height,
  fileSize: photo.size,
  mimeType: photo.mimeType,
});

export async function enqueueStaffTruckload(input: StaffTruckloadQueueInput) {
  const database = await getDatabase();
  const existing = await database.getFirstAsync<{ client_id: string }>(
    'SELECT client_id FROM staff_truckload_queue WHERE client_id = ?',
    input.clientSubmissionId,
  );
  if (existing) return { alreadyQueued: true };

  const sideUri = await persistPhoto(input.sidePhoto, input.clientSubmissionId, 'side');
  let backUri = '';
  try {
    backUri = await persistPhoto(input.backPhoto, input.clientSubmissionId, 'back');
    const payload: QueuePayload = {
      clientSubmissionId: input.clientSubmissionId,
      truckPlate: input.truckPlate,
      routeId: input.routeId,
      area: input.area,
      driver: input.driver,
      length: input.length,
      width: input.width,
      height: input.height,
      slope: input.slope,
      notes: input.notes,
      sidePhoto: { ...input.sidePhoto, uri: sideUri },
      backPhoto: { ...input.backPhoto, uri: backUri },
    };

    await database.runAsync(
      `INSERT INTO staff_truckload_queue
         (client_id, staff_id, payload_json, side_photo_uri, back_photo_uri, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      input.clientSubmissionId,
      input.staffId,
      JSON.stringify(payload),
      sideUri,
      backUri,
      new Date().toISOString(),
    );
    return { alreadyQueued: false };
  } catch (error) {
    await deletePhoto(sideUri);
    if (backUri) await deletePhoto(backUri);
    throw error;
  }
}

export function getStaffTruckloadQueueStats(staffId: string): Promise<StaffQueueStats> {
  return getDatabase().then((database) => database.getFirstAsync<{ pending: number; failed: number }>(
    `SELECT COUNT(*) AS pending,
            COALESCE(SUM(CASE WHEN last_error IS NOT NULL THEN 1 ELSE 0 END), 0) AS failed
     FROM staff_truckload_queue
     WHERE staff_id = ?`,
    staffId,
  )).then((row) => ({ pending: row?.pending || 0, failed: row?.failed || 0 }));
}

const getQueueRows = async (staffId: string) => {
  const database = await getDatabase();
  return database.getAllAsync<QueueRow>(
    `SELECT client_id, staff_id, payload_json, side_photo_uri, back_photo_uri, attempts, last_error, created_at
     FROM staff_truckload_queue
     WHERE staff_id = ?
     ORDER BY created_at ASC`,
    staffId,
  );
};

export async function getQueuedStaffTruckloads(staffId: string): Promise<QueuedStaffTruckloadRecord[]> {
  try {
    const database = await getDatabase();
    const rows = await database.getAllAsync<QueueRow>(
      `SELECT client_id, staff_id, payload_json, side_photo_uri, back_photo_uri, attempts, last_error, created_at
       FROM staff_truckload_queue
       WHERE staff_id = ?
       ORDER BY created_at DESC`,
      staffId,
    );

    return rows.map((row) => {
      try {
        const payload = JSON.parse(row.payload_json) as QueuePayload;
        return {
          clientId: row.client_id,
          staffId: row.staff_id,
          truckPlate: payload.truckPlate,
          routeId: payload.routeId,
          area: payload.area,
          driver: payload.driver,
          length: payload.length,
          width: payload.width,
          height: payload.height,
          slope: payload.slope,
          notes: payload.notes || '',
          sidePhotoUri: row.side_photo_uri,
          backPhotoUri: row.back_photo_uri,
          attempts: row.attempts,
          lastError: row.last_error,
          createdAt: row.created_at,
        };
      } catch {
        return null;
      }
    }).filter(Boolean) as QueuedStaffTruckloadRecord[];
  } catch (err) {
    console.warn('Failed to get queued staff truckloads:', err);
    return [];
  }
}

const markFailed = async (clientId: string, error: string) => {
  const database = await getDatabase();
  await database.runAsync(
    `UPDATE staff_truckload_queue
     SET attempts = attempts + 1, last_error = ?
     WHERE client_id = ?`,
    error,
    clientId,
  );
};

const removeRow = async (row: QueueRow) => {
  const database = await getDatabase();
  await database.runAsync('DELETE FROM staff_truckload_queue WHERE client_id = ?', row.client_id);
  await deletePhoto(row.side_photo_uri);
  await deletePhoto(row.back_photo_uri);
};

const appendQueuedPhoto = (formData: FormData, field: string, photo: StaffQueuePhoto) => {
  formData.append(field, {
    uri: photo.uri,
    name: photo.fileName,
    type: photo.mimeType,
  } as unknown as Blob);
};

const syncQueue = async ({ apiUrl, token, staffId }: StaffQueueSyncContext): Promise<StaffQueueSyncResult> => {
  const before = await getStaffTruckloadQueueStats(staffId);
  if (!before.pending) return { ...before, synced: 0 };

  const network = await NetInfo.fetch();
  if (!network.isConnected || network.isInternetReachable === false) return { ...before, synced: 0 };

  let synced = 0;
  const rows = await getQueueRows(staffId);
  for (const row of rows) {
    try {
      const payload = JSON.parse(row.payload_json) as QueuePayload;
      const formData = new FormData();
      formData.append('clientSubmissionId', payload.clientSubmissionId);
      formData.append('truckPlate', payload.truckPlate);
      if (payload.routeId) formData.append('routeId', payload.routeId);
      if (payload.area) formData.append('area', payload.area);
      if (payload.driver) formData.append('driver', payload.driver);
      formData.append('length', payload.length);
      formData.append('width', payload.width);
      formData.append('height', payload.height);
      formData.append('slope', payload.slope);
      formData.append('notes', payload.notes);
      appendQueuedPhoto(formData, 'sidePhoto', payload.sidePhoto);
      appendQueuedPhoto(formData, 'backPhoto', payload.backPhoto);
      formData.append('sidePhotoMetadata', photoMetadata(payload.sidePhoto));
      formData.append('backPhotoMetadata', photoMetadata(payload.backPhoto));

      const response = await fetch(`${apiUrl.replace(/\/$/, '')}/staff/truckloads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const result = await response.json().catch(() => ({} as { error?: string }));

      if (!response.ok || !(result as { success?: boolean }).success) {
        // If idempotent already exists on backend
        if (response.status === 409) {
          await removeRow(row);
          synced += 1;
          continue;
        }
        await markFailed(row.client_id, result.error || `Sync failed (${response.status}).`);
        if (response.status < 500) continue;
        break;
      }

      await removeRow(row);
      synced += 1;
    } catch {
      await markFailed(row.client_id, 'Waiting for a network connection.');
      break;
    }
  }

  return { ...(await getStaffTruckloadQueueStats(staffId)), synced };
};

export function syncStaffTruckloadQueue(context: StaffQueueSyncContext) {
  if (!syncInFlight) syncInFlight = syncQueue(context).finally(() => { syncInFlight = null; });
  return syncInFlight;
}

export function subscribeToStaffTruckloadSync(
  context: StaffQueueSyncContext,
  onSync?: (result: StaffQueueSyncResult) => void,
) {
  const sync = async () => onSync?.(await syncStaffTruckloadQueue(context));
  const unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected && state.isInternetReachable !== false) void sync();
  });
  void sync();
  return unsubscribe;
}
