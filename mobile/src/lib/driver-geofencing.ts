import { Platform } from 'react-native';
import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';
import * as TaskManager from 'expo-task-manager';
import { clearGeofenceEntries, deleteGeofenceEntry, getGeofenceEntry, queueRouteLog, recordGeofenceEntry, syncRouteLogQueue } from '@/lib/driver-route-log-queue';
import { getSession } from '@/lib/session';

// Defined at module scope so Android can execute the task after the app is backgrounded.

export const DRIVER_GEOFENCE_TASK = 'resiklean-driver-geofence';

const GEOFENCE_CONFIG_KEY = 'resiklean.driver-geofence.config';
const GEOFENCE_RADIUS_METERS = 50;
const MAX_GEOFENCE_REGIONS = Platform.OS === 'ios' ? 20 : 100;

type GeofenceConfig = {
  apiUrl: string;
};

export type DriverGeofenceStop = {
  id: string;
  latitude: number;
  longitude: number;
};

export type GeofencingSetupResult = {
  enabled: boolean;
  message: string;
};

const readStoredJson = async <T,>(key: string): Promise<T | null> => {
  const value = await SecureStore.getItemAsync(key);
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    await SecureStore.deleteItemAsync(key);
    return null;
  }
};

const writeStoredJson = (key: string, value: unknown) => SecureStore.setItemAsync(key, JSON.stringify(value));

const getConfig = () => readStoredJson<GeofenceConfig>(GEOFENCE_CONFIG_KEY);

const handleGeofenceEvent = async (eventType: Location.LocationGeofencingEventType, region: Location.LocationRegion) => {
  const stopId = region.identifier;
  if (!stopId) return;

  if (eventType === Location.GeofencingEventType.Enter) {
    await recordGeofenceEntry(stopId);
    return;
  }

  if (eventType !== Location.GeofencingEventType.Exit) return;

  const [config, session, activeStop] = await Promise.all([getConfig(), getSession(), getGeofenceEntry(stopId)]);
  const collectorId = session?.user._id || session?.user.id;
  if (!config || !session?.token || !collectorId || !activeStop) return;

  let lastKnownPosition: Location.LocationObject | null = null;
  try {
    lastKnownPosition = await Location.getLastKnownPositionAsync({
      maxAge: 2 * 60 * 1000,
      requiredAccuracy: 100,
    });
  } catch {
    // The geofence center is still a useful fallback when the platform cannot provide a recent fix.
  }
  await queueRouteLog({
    collectorId,
    stopId: activeStop.stopId,
    collectedAt: activeStop.collectedAt,
    exitedAt: new Date().toISOString(),
    latitude: lastKnownPosition?.coords.latitude ?? region.latitude,
    longitude: lastKnownPosition?.coords.longitude ?? region.longitude,
  });
  await deleteGeofenceEntry(stopId);

  // This is one combined entry/exit record. If offline, syncRouteLogQueue leaves
  // it in SQLite and NetInfo retries it as a UUID-idempotent batch later.
  await syncRouteLogQueue({ apiUrl: config.apiUrl, token: session.token, collectorId });
};

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(DRIVER_GEOFENCE_TASK)) {
  TaskManager.defineTask(DRIVER_GEOFENCE_TASK, async ({ data, error }) => {
    if (error || !data) return;

    const event = data as {
      eventType: Location.LocationGeofencingEventType;
      region: Location.LocationRegion;
    };
    await handleGeofenceEvent(event.eventType, event.region);
  });
}

export async function getDriverGeofencingStatus() {
  if (Platform.OS === 'web' || !await TaskManager.isAvailableAsync()) return false;

  return Location.hasStartedGeofencingAsync(DRIVER_GEOFENCE_TASK);
}

export async function enableDriverGeofencing({ apiUrl, stops }: { apiUrl: string; stops: DriverGeofenceStop[] }): Promise<GeofencingSetupResult> {
  if (Platform.OS === 'web') {
    return { enabled: false, message: 'Background geofencing is available only in the Android or iOS app.' };
  }

  if (!await TaskManager.isAvailableAsync()) {
    return { enabled: false, message: 'Use a rebuilt development app; Expo Go cannot run background geofencing.' };
  }

  if (!stops.length) {
    return { enabled: false, message: 'No route stops are available to monitor.' };
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') {
    return { enabled: false, message: 'Location permission is required to monitor collection stops.' };
  }

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') {
    return { enabled: false, message: 'Allow location all the time in Settings to enable background geofencing.' };
  }

  const regions: Location.LocationRegion[] = stops.slice(0, MAX_GEOFENCE_REGIONS).map((stop) => ({
    identifier: stop.id,
    latitude: stop.latitude,
    longitude: stop.longitude,
    radius: GEOFENCE_RADIUS_METERS,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  try {
    await writeStoredJson(GEOFENCE_CONFIG_KEY, { apiUrl });
    await Location.startGeofencingAsync(DRIVER_GEOFENCE_TASK, regions);
    return { enabled: true, message: `Monitoring ${regions.length} collection stops in the background.` };
  } catch {
    await SecureStore.deleteItemAsync(GEOFENCE_CONFIG_KEY);
    return { enabled: false, message: 'Unable to start background geofencing on this device.' };
  }
}

export async function updateDriverGeofences({ apiUrl, stops }: { apiUrl: string; stops: DriverGeofenceStop[] }) {
  if (!await getDriverGeofencingStatus()) return false;
  if (!stops.length) return false;

  const regions: Location.LocationRegion[] = stops.slice(0, MAX_GEOFENCE_REGIONS).map((stop) => ({
    identifier: stop.id,
    latitude: stop.latitude,
    longitude: stop.longitude,
    radius: GEOFENCE_RADIUS_METERS,
    notifyOnEnter: true,
    notifyOnExit: true,
  }));

  await writeStoredJson(GEOFENCE_CONFIG_KEY, { apiUrl });
  await Location.startGeofencingAsync(DRIVER_GEOFENCE_TASK, regions);
  return true;
}

export async function stopDriverGeofencing({ clearPending = false, forgetConfiguration = false }: { clearPending?: boolean; forgetConfiguration?: boolean } = {}) {
  try {
    if (await getDriverGeofencingStatus()) {
      await Location.stopGeofencingAsync(DRIVER_GEOFENCE_TASK);
    }
  } finally {
    const cleanup = [clearGeofenceEntries()];
    if (forgetConfiguration) cleanup.push(SecureStore.deleteItemAsync(GEOFENCE_CONFIG_KEY));
    if (clearPending) {
      // Kept for API compatibility. Queue records remain by design so a driver
      // never loses an offline completion after background monitoring is turned off.
    }
    await Promise.all(cleanup);
  }
}

export async function flushDriverGeofenceQueue() {
  const [config, session] = await Promise.all([getConfig(), getSession()]);
  const collectorId = session?.user._id || session?.user.id;
  if (!config || !session?.token || !collectorId) return { pending: 0, failed: 0, synced: 0 };

  const result = await syncRouteLogQueue({ apiUrl: config.apiUrl, token: session.token, collectorId });
  return result;
}
