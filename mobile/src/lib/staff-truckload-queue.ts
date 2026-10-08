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
      `);
      return database;
    });
  }

  return databasePromise;
};

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
      formData.append('routeId', payload.routeId);
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
        await markFailed(row.client_id, result.error || `Sync failed (${response.status}).`);
        if (response.status < 500) break;
        continue;
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
