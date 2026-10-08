import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { finishDriverTrailSession, recordDriverTrailLocation, startDriverTrailSession } from '@/lib/driver-trail-queue';

export const DRIVER_ROUTE_PROXIMITY_TASK = 'resiklean-driver-route-proximity';
export const ROUTE_ENTER_TOLERANCE_METERS = 45;
export const ROUTE_EXIT_TOLERANCE_METERS = 65;

const DATABASE_NAME = 'resiklean-driver-route-tracking.db';
const EARTH_RADIUS_METERS = 6_371_008.8;

export type RoutePath = {
  type: 'LineString' | 'MultiLineString';
  coordinates: unknown;
};

export type RouteTrackingSetupResult = {
  enabled: boolean;
  message: string;
};

export type RoutePresenceState = 'unknown' | 'on_route' | 'off_route';

export type RoutePresenceStatus = {
  enabled: boolean;
  state: RoutePresenceState;
  routeId?: string;
  routeName?: string;
  distanceMeters?: number;
  accuracyMeters?: number;
  lastCheckedAt?: string;
  lastChangedAt?: string;
};

export type RoutePresenceEvent = {
  id: string;
  routeId: string;
  eventType: 'entered' | 'left';
  occurredAt: string;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  accuracyMeters?: number;
};

export type RouteTrackingConfig = {
  routeId: string;
  routeName: string;
  routePath: RoutePath;
  collectorId?: string;
};

type TrackingStateRow = {
  route_id: string;
  route_name: string;
  state: RoutePresenceState;
  distance_meters: number | null;
  accuracy_meters: number | null;
  last_checked_at: string | null;
  last_changed_at: string | null;
};

type EventRow = {
  id: string;
  route_id: string;
  event_type: 'entered' | 'left';
  occurred_at: string;
  latitude: number;
  longitude: number;
  distance_meters: number;
  accuracy_meters: number | null;
};

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;
const statusListeners = new Set<(status: RoutePresenceStatus) => void>();

const getDatabase = () => {
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME).then(async (database) => {
      await database.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS driver_route_tracking_config (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          collector_id TEXT,
          route_id TEXT NOT NULL,
          route_name TEXT NOT NULL,
          route_path_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS driver_route_presence_state (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          route_id TEXT NOT NULL,
          route_name TEXT NOT NULL,
          state TEXT NOT NULL,
          distance_meters REAL,
          accuracy_meters REAL,
          last_checked_at TEXT,
          last_changed_at TEXT
        );
        CREATE TABLE IF NOT EXISTS driver_route_presence_events (
          id TEXT PRIMARY KEY NOT NULL,
          route_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          occurred_at TEXT NOT NULL,
          latitude REAL NOT NULL,
          longitude REAL NOT NULL,
          distance_meters REAL NOT NULL,
          accuracy_meters REAL,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS driver_route_presence_events_route_idx
          ON driver_route_presence_events (route_id, occurred_at DESC);
        CREATE TABLE IF NOT EXISTS driver_assigned_route_cache (
          collector_id TEXT PRIMARY KEY NOT NULL,
          route_json TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
      `);
      const columns = await database.getAllAsync<{ name: string }>('PRAGMA table_info(driver_route_tracking_config)');
      if (!columns.some((column) => column.name === 'collector_id')) {
        await database.execAsync('ALTER TABLE driver_route_tracking_config ADD COLUMN collector_id TEXT');
      }
      return database;
    });
  }

  return databasePromise;
};

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

const normalizeCoordinate = (value: unknown): [number, number] | null => {
  if (!Array.isArray(value) || value.length < 2) return null;

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;

  return [longitude, latitude];
};

const normalizeLine = (value: unknown): [number, number][] => {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);
};

export const getRouteLines = (routePath?: RoutePath): [number, number][][] => {
  if (!routePath || !Array.isArray(routePath.coordinates)) return [];
  if (routePath.type === 'LineString') {
    const line = normalizeLine(routePath.coordinates);
    return line.length >= 2 ? [line] : [];
  }

  if (routePath.type === 'MultiLineString') {
    return routePath.coordinates
      .map(normalizeLine)
      .filter((line) => line.length >= 2);
  }

  return [];
};

export const getRouteBounds = (routePath?: RoutePath): [[number, number], [number, number]] | null => {
  const coordinates = getRouteLines(routePath).flat();
  if (!coordinates.length) return null;

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.max(...longitudes), Math.max(...latitudes)],
    [Math.min(...longitudes), Math.min(...latitudes)],
  ];
};

export const getDistanceToRouteMeters = (latitude: number, longitude: number, routePath?: RoutePath): number | null => {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  const latitudeRadians = toRadians(latitude);
  let shortestDistance = Number.POSITIVE_INFINITY;

  for (const line of getRouteLines(routePath)) {
    for (let index = 1; index < line.length; index += 1) {
      const [startLongitude, startLatitude] = line[index - 1];
      const [endLongitude, endLatitude] = line[index];
      const startX = toRadians(startLongitude - longitude) * EARTH_RADIUS_METERS * Math.cos(latitudeRadians);
      const startY = toRadians(startLatitude - latitude) * EARTH_RADIUS_METERS;
      const endX = toRadians(endLongitude - longitude) * EARTH_RADIUS_METERS * Math.cos(latitudeRadians);
      const endY = toRadians(endLatitude - latitude) * EARTH_RADIUS_METERS;
      const deltaX = endX - startX;
      const deltaY = endY - startY;
      const segmentLengthSquared = deltaX * deltaX + deltaY * deltaY;
      const projection = segmentLengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(startX * deltaX + startY * deltaY) / segmentLengthSquared));
      const nearestX = startX + projection * deltaX;
      const nearestY = startY + projection * deltaY;
      shortestDistance = Math.min(shortestDistance, Math.hypot(nearestX, nearestY));
    }
  }

  return Number.isFinite(shortestDistance) ? shortestDistance : null;
};

const getConfig = async (): Promise<RouteTrackingConfig | null> => {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ collector_id: string | null; route_id: string; route_name: string; route_path_json: string }>(
    'SELECT collector_id, route_id, route_name, route_path_json FROM driver_route_tracking_config WHERE id = 1',
  );
  if (!row) return null;

  try {
    const routePath = JSON.parse(row.route_path_json) as RoutePath;
    return getRouteLines(routePath).length ? { collectorId: row.collector_id ?? undefined, routeId: row.route_id, routeName: row.route_name, routePath } : null;
  } catch {
    return null;
  }
};

const getStoredStatus = async (): Promise<RoutePresenceStatus> => {
  const database = await getDatabase();
  const row = await database.getFirstAsync<TrackingStateRow>(
    `SELECT route_id, route_name, state, distance_meters, accuracy_meters, last_checked_at, last_changed_at
     FROM driver_route_presence_state WHERE id = 1`,
  );
  if (!row) return { enabled: false, state: 'unknown' };

  return {
    enabled: false,
    state: row.state,
    routeId: row.route_id,
    routeName: row.route_name,
    distanceMeters: row.distance_meters ?? undefined,
    accuracyMeters: row.accuracy_meters ?? undefined,
    lastCheckedAt: row.last_checked_at ?? undefined,
    lastChangedAt: row.last_changed_at ?? undefined,
  };
};

const emitStatus = (status: RoutePresenceStatus) => {
  statusListeners.forEach((listener) => listener(status));
};

const savePresence = async (location: Location.LocationObject) => {
  const config = await getConfig();
  if (!config) return;

  const { latitude, longitude, accuracy } = location.coords;
  const distanceMeters = getDistanceToRouteMeters(latitude, longitude, config.routePath);
  if (distanceMeters === null) return;

  const current = await getStoredStatus();
  const wasOnRoute = current.routeId === config.routeId && current.state === 'on_route';
  const nextState: RoutePresenceState = wasOnRoute
    ? (distanceMeters > ROUTE_EXIT_TOLERANCE_METERS ? 'off_route' : 'on_route')
    : (distanceMeters <= ROUTE_ENTER_TOLERANCE_METERS ? 'on_route' : 'off_route');
  const checkedAt = new Date(location.timestamp || Date.now()).toISOString();
  const stateChanged = current.routeId === config.routeId && current.state !== 'unknown' && current.state !== nextState;
  const firstEntry = current.routeId !== config.routeId || current.state === 'unknown';
  const changedAt = stateChanged || (firstEntry && nextState === 'on_route') ? checkedAt : current.lastChangedAt || null;
  const database = await getDatabase();

  await database.runAsync(
    `INSERT INTO driver_route_presence_state
       (id, route_id, route_name, state, distance_meters, accuracy_meters, last_checked_at, last_changed_at)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       route_id = excluded.route_id,
       route_name = excluded.route_name,
       state = excluded.state,
       distance_meters = excluded.distance_meters,
       accuracy_meters = excluded.accuracy_meters,
       last_checked_at = excluded.last_checked_at,
       last_changed_at = excluded.last_changed_at`,
    config.routeId,
    config.routeName,
    nextState,
    distanceMeters,
    accuracy,
    checkedAt,
    changedAt,
  );

  const shouldRecordEvent = ((stateChanged || firstEntry) && nextState === 'on_route')
    || (stateChanged && nextState === 'off_route');
  if (shouldRecordEvent) {
    await database.runAsync(
      `INSERT INTO driver_route_presence_events
         (id, route_id, event_type, occurred_at, latitude, longitude, distance_meters, accuracy_meters, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      Crypto.randomUUID(),
      config.routeId,
      nextState === 'on_route' ? 'entered' : 'left',
      checkedAt,
      latitude,
      longitude,
      distanceMeters,
      accuracy,
      new Date().toISOString(),
    );
  }

  const status = await getStoredStatus();
  emitStatus({ ...status, enabled: true });
};

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(DRIVER_ROUTE_PROXIMITY_TASK)) {
  TaskManager.defineTask(DRIVER_ROUTE_PROXIMITY_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations || [];
    const config = await getConfig();
    for (const location of locations) {
      await recordDriverTrailLocation(location, config?.collectorId);
    }
    const latestLocation = locations[locations.length - 1];
    if (latestLocation) await savePresence(latestLocation);
  });
}

export async function cacheAssignedRoute(collectorId: string, route: unknown) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_assigned_route_cache (collector_id, route_json, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(collector_id) DO UPDATE SET route_json = excluded.route_json, updated_at = excluded.updated_at`,
    collectorId,
    JSON.stringify(route),
    new Date().toISOString(),
  );
}

export async function getCachedAssignedRoute<T>(collectorId: string): Promise<T | null> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ route_json: string }>(
    'SELECT route_json FROM driver_assigned_route_cache WHERE collector_id = ?',
    collectorId,
  );
  if (!row) return null;

  try {
    return JSON.parse(row.route_json) as T;
  } catch {
    return null;
  }
}

export async function clearCachedAssignedRoute(collectorId?: string) {
  if (!collectorId) return;
  const database = await getDatabase();
  await database.runAsync('DELETE FROM driver_assigned_route_cache WHERE collector_id = ?', collectorId);
}

export async function getRouteProximityStatus(): Promise<RoutePresenceStatus> {
  const status = await getStoredStatus();
  if (Platform.OS === 'web' || !await TaskManager.isAvailableAsync()) return status;

  const config = await getConfig();
  const shouldBeEnabled = config !== null;
  const isActuallyEnabled = await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);

  if (shouldBeEnabled && !isActuallyEnabled && AppState.currentState === 'active') {
    enableRouteProximityTracking(config).catch(() => {});
  }

  return { ...status, enabled: shouldBeEnabled };
}

export async function getRouteProximityEvents(routeId: string, limit = 6): Promise<RoutePresenceEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<EventRow>(
    `SELECT id, route_id, event_type, occurred_at, latitude, longitude, distance_meters, accuracy_meters
     FROM driver_route_presence_events
     WHERE route_id = ?
     ORDER BY occurred_at DESC
     LIMIT ?`,
    routeId,
    limit,
  );

  return rows.map((row) => ({
    id: row.id,
    routeId: row.route_id,
    eventType: row.event_type,
    occurredAt: row.occurred_at,
    latitude: row.latitude,
    longitude: row.longitude,
    distanceMeters: row.distance_meters,
    accuracyMeters: row.accuracy_meters ?? undefined,
  }));
}

export function subscribeToRouteProximityStatus(listener: (status: RoutePresenceStatus) => void) {
  statusListeners.add(listener);
  return () => statusListeners.delete(listener);
}

async function persistRouteTrackingConfig({ collectorId, routeId, routeName, routePath }: RouteTrackingConfig) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_route_tracking_config (id, collector_id, route_id, route_name, route_path_json, updated_at)
     VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET collector_id = excluded.collector_id, route_id = excluded.route_id, route_name = excluded.route_name, route_path_json = excluded.route_path_json, updated_at = excluded.updated_at`,
    collectorId ?? null,
    routeId,
    routeName,
    JSON.stringify(routePath),
    new Date().toISOString(),
  );
}

export async function enableRouteProximityTracking({ collectorId, routeId, routeName, routePath }: RouteTrackingConfig): Promise<RouteTrackingSetupResult> {
  if (Platform.OS === 'web') return { enabled: false, message: 'Route monitoring is available only in the Android or iOS app.' };
  if (!await TaskManager.isAvailableAsync()) return { enabled: false, message: 'Use a rebuilt development app to run route monitoring in the background.' };
  if (!getRouteLines(routePath).length) return { enabled: false, message: 'This assigned route does not include a valid traced road line yet.' };

  const alreadyRunning = await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
  await persistRouteTrackingConfig({ collectorId, routeId, routeName, routePath });
  if (alreadyRunning) {
    if (collectorId) {
      await startDriverTrailSession({ collectorId, routeId, routeName });
    }
    Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(savePresence).catch(() => {});
    return { enabled: true, message: `Monitoring the assigned road route within ${ROUTE_ENTER_TOLERANCE_METERS} m.` };
  }

  // Android cannot start its foreground location service while the app is in
  // the background. The task will continue running if it was already started;
  // a new start must wait until the user brings the app back to the foreground.
  if (AppState.currentState !== 'active') {
    return { enabled: false, message: 'Open the app before enabling route monitoring.' };
  }

  const foreground = await Location.requestForegroundPermissionsAsync();
  if (foreground.status !== 'granted') return { enabled: false, message: 'Location permission is required to monitor your assigned route.' };

  const background = await Location.requestBackgroundPermissionsAsync();
  if (background.status !== 'granted') return { enabled: false, message: 'Allow location all the time in Settings to monitor your route in the background.' };

  try {
    await Location.startLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK, {
      accuracy: Location.Accuracy.High,
      deferredUpdatesDistance: 20,
      deferredUpdatesInterval: 15_000,
      distanceInterval: 20,
      foregroundService: {
        notificationBody: 'Monitoring your distance from the assigned collection route.',
        notificationTitle: 'ResiKlean route monitoring',
      },
      pausesUpdatesAutomatically: false,
    });
  } catch {
    return { enabled: false, message: 'Android could not start route monitoring. Open the app and try Enable again.' };
  }

  if (collectorId) {
    await startDriverTrailSession({ collectorId, routeId, routeName });
  }

  Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).then(savePresence).catch(() => {});

  return { enabled: true, message: `Monitoring the assigned road route within ${ROUTE_ENTER_TOLERANCE_METERS} m.` };
}

export async function updateRouteProximityTracking(config: RouteTrackingConfig) {
  const status = await getRouteProximityStatus();
  if (!status.enabled) return false;
  const result = await enableRouteProximityTracking(config);
  return result.enabled;
}

export async function stopRouteProximityTracking({ forgetConfiguration = false }: { forgetConfiguration?: boolean } = {}) {
  await finishDriverTrailSession();
  if (Platform.OS !== 'web' && await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK)) {
    await Location.stopLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
  }

  if (forgetConfiguration) {
    const database = await getDatabase();
    await database.execAsync(`
      DELETE FROM driver_route_tracking_config;
      DELETE FROM driver_route_presence_state;
      DELETE FROM driver_route_presence_events;
    `);
  }
}
