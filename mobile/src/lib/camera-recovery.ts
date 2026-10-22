import * as SecureStore from 'expo-secure-store';

const PENDING_CAMERA_KEY = 'resiklean.pending_camera_context';

export type AuditPhotoData = {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  capturedAt: string;
};

export type PendingStaffCameraContext = {
  type: 'staff';
  slot: 'side' | 'back';
  truckPlate: string;
  area: string;
  routeId: string;
  driver: string;
  slope: string;
  length: string;
  width: string;
  height: string;
  notes: string;
  existingSidePhoto?: AuditPhotoData | null;
  existingBackPhoto?: AuditPhotoData | null;
};

export type PendingResidentCameraContext = {
  type: 'resident';
  category?: string;
  notes?: string;
  locationDetails?: string;
  urgency?: string;
  wasteType?: string;
};

export type PendingCollectorCameraContext = {
  type: 'collector';
  complaintId?: string;
};

export type PendingCameraContext =
  | PendingStaffCameraContext
  | PendingResidentCameraContext
  | PendingCollectorCameraContext;

export async function savePendingCameraContext(context: PendingCameraContext): Promise<void> {
  try {
    await SecureStore.setItemAsync(PENDING_CAMERA_KEY, JSON.stringify(context));
  } catch {
    // If SecureStore fails, non-blocking fallback
  }
}

export async function getPendingCameraContext(): Promise<PendingCameraContext | null> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_CAMERA_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PendingCameraContext;
  } catch {
    return null;
  }
}

export async function clearPendingCameraContext(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(PENDING_CAMERA_KEY);
  } catch {
    // Best-effort removal
  }
}
