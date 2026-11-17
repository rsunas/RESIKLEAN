import * as Crypto from 'expo-crypto';
import * as Location from 'expo-location';
import * as SQLite from 'expo-sqlite';
import * as TaskManager from 'expo-task-manager';
import { AppState, Platform } from 'react-native';
import { finishDriverTrailSession, recordDriverTrailLocation, startDriverTrailSession } from '@/lib/driver-trail-queue';
import { getSession } from '@/lib/session';

export const DRIVER_ROUTE_PROXIMITY_TASK = 'resiklean-driver-route-proximity';
export { ROUTE_ENTER_TOLERANCE_METERS, ROUTE_EXIT_TOLERANCE_METERS } from './route-presence-filter';
import { emptyPresenceFilter, evaluateRoutePresence, monitoringDay, ROUTE_MAX_FIX_AGE_MS, type PresenceFilter, type PresenceSignal } from './route-presence-filter';

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
  signal?: PresenceSignal;
  hasEntered?: boolean;
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
  routePath?: RoutePath | null;
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
        CREATE TABLE IF NOT EXISTS driver_route_detection (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          filter_json TEXT NOT NULL,
          signal TEXT NOT NULL,
          armed_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS driver_route_monitoring_preferences (
          collector_id TEXT PRIMARY KEY NOT NULL,
          consent INTEGER,
          paused_day TEXT
        );
        CREATE TABLE IF NOT EXISTS driver_trip_start_prompts (
          collector_id TEXT NOT NULL,
          route_id TEXT NOT NULL,
          prompt_day TEXT NOT NULL,
          PRIMARY KEY (collector_id, route_id, prompt_day)
        );
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

export const getRouteLines = (routePath?: RoutePath | null): [number, number][][] => {
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

export const getRouteBounds = (routePath?: RoutePath | null): [[number, number], [number, number]] | null => {
  const coordinates = getRouteLines(routePath).flat();
  if (!coordinates.length) return null;

  const longitudes = coordinates.map(([longitude]) => longitude);
  const latitudes = coordinates.map(([, latitude]) => latitude);
  return [
    [Math.max(...longitudes), Math.max(...latitudes)],
    [Math.min(...longitudes), Math.min(...latitudes)],
  ];
};

export const getDistanceToRouteMeters = (latitude: number, longitude: number, routePath?: RoutePath | null): number | null => {
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
    return row.collector_id && row.route_id ? { collectorId: row.collector_id ?? undefined, routeId: row.route_id, routeName: row.route_name, routePath } : null;
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

// Serialize native batches, foreground samples, setup and teardown. An obsolete
// batch cannot write into a new route/session after a stop or account change.
let trackingOperations: Promise<unknown> = Promise.resolve();
let trackingGeneration = 0;
let trackingSuppressed = false;
const serializeTracking = <T,>(work: () => Promise<T>): Promise<T> => {
  const next = trackingOperations.then(work, work);
  trackingOperations = next.catch(() => undefined);
  return next;
};

type DetectionRow = { filter_json: string; signal: PresenceSignal; armed_at: number };
async function readDetection() {
  const database = await getDatabase();
  const row = await database.getFirstAsync<DetectionRow>('SELECT filter_json, signal, armed_at FROM driver_route_detection WHERE id = 1');
  let filter = emptyPresenceFilter();
  try { if (row) filter = JSON.parse(row.filter_json) as PresenceFilter; } catch { /* Reconfirm after damaged local state. */ }
  return { filter, signal: row?.signal ?? 'confirming' as PresenceSignal, armedAt: row?.armed_at ?? Date.now() };
}

const processPresence = async (location: Location.LocationObject, expected?: { collectorId?: string; routeId: string }) => {
  const config = await getConfig();
  if (!config || (expected && (config.collectorId !== expected.collectorId || config.routeId !== expected.routeId))) return;
  if (trackingSuppressed || !await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK)) return;
  const session = await getSession();
  if (!session?.token || session.user.role !== 'collector' || (session.user._id || session.user.id) !== config.collectorId) return;
  const detection = await readDetection();
  if (location.timestamp < detection.armedAt) return;
  const distance = getDistanceToRouteMeters(location.coords.latitude, location.coords.longitude, config.routePath);
  const result = evaluateRoutePresence(detection.filter, location, distance, Date.now());
  const database = await getDatabase();
  const current = await getStoredStatus();
  const checkedAt = result.accepted ? new Date(location.timestamp).toISOString() : current.lastCheckedAt;
  const changedAt = result.changed ? checkedAt : current.lastChangedAt;
  const event = result.changed && result.filter.state === 'on_route' ? 'entered'
    : result.changed && result.filter.state === 'off_route' && detection.filter.hasEntered ? 'left' : null;
  await database.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.runAsync(
      'INSERT OR REPLACE INTO driver_route_detection (id, filter_json, signal, armed_at) VALUES (1, ?, ?, ?)',
      JSON.stringify(result.filter), result.signal, detection.armedAt,
    );
    await transaction.runAsync(
      `INSERT OR REPLACE INTO driver_route_presence_state
        (id, route_id, route_name, state, distance_meters, accuracy_meters, last_checked_at, last_changed_at)
       VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      config.routeId, config.routeName, result.filter.state,
      result.accepted ? distance : current.distanceMeters ?? null,
      result.accepted ? location.coords.accuracy : current.accuracyMeters ?? null,
      checkedAt ?? null, changedAt ?? null,
    );
    if (event) {
      await transaction.runAsync(
        `INSERT INTO driver_route_presence_events
          (id, route_id, event_type, occurred_at, latitude, longitude, distance_meters, accuracy_meters, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        Crypto.randomUUID(), config.routeId, event, checkedAt!,
        location.coords.latitude, location.coords.longitude, distance!, location.coords.accuracy, new Date().toISOString(),
      );
    }
  });
  // Record the explicitly started trip independently of route entry.
  // GPS quality checks still reject stale, inaccurate, mocked and jumping fixes.
  if (result.accepted && config.collectorId) {
    await startDriverTrailSession({ collectorId: config.collectorId, routeId: config.routeId, routeName: config.routeName, routePath: config.routePath });
    await recordDriverTrailLocation(location, config.collectorId);
  }
  emitStatus({ ...(await getStoredStatus()), enabled: true, signal: result.signal, hasEntered: result.filter.hasEntered });
};

export function processDriverRouteLocation(location: Location.LocationObject, expected?: { collectorId?: string; routeId: string }, generation = trackingGeneration) {
  return serializeTracking(async () => {
    if (generation !== trackingGeneration) return;
    await processPresence(location, expected);
  }).catch((error) => { console.warn('Unable to process route location:', error); });
}

if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(DRIVER_ROUTE_PROXIMITY_TASK)) {
  TaskManager.defineTask(DRIVER_ROUTE_PROXIMITY_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const generation = trackingGeneration;
    const config = await getConfig();
    if (!config) return;
    const locations = (data as { locations?: Location.LocationObject[] }).locations || [];
    for (const location of [...locations].sort((left, right) => left.timestamp - right.timestamp)) {
      await processDriverRouteLocation(location, config, generation);
    }
  });
}

export type RouteMonitoringPreference = { consent: boolean | null; pausedDay: string | null };
export async function getRouteMonitoringPreference(collectorId: string): Promise<RouteMonitoringPreference> {
  const database = await getDatabase();
  const row = await database.getFirstAsync<{ consent: number | null; paused_day: string | null }>(
    'SELECT consent, paused_day FROM driver_route_monitoring_preferences WHERE collector_id = ?', collectorId,
  );
  return { consent: row?.consent == null ? null : Boolean(row.consent), pausedDay: row?.paused_day ?? null };
}
export async function setRouteMonitoringConsent(collectorId: string, consent: boolean) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_route_monitoring_preferences (collector_id, consent, paused_day) VALUES (?, ?, NULL)
     ON CONFLICT(collector_id) DO UPDATE SET consent = excluded.consent, paused_day = NULL`,
    collectorId, consent ? 1 : 0,
  );
}
export async function pauseRouteMonitoringToday(collectorId: string) {
  const database = await getDatabase();
  await database.runAsync(
    `INSERT INTO driver_route_monitoring_preferences (collector_id, consent, paused_day) VALUES (?, NULL, ?)
     ON CONFLICT(collector_id) DO UPDATE SET paused_day = excluded.paused_day`,
    collectorId, monitoringDay(),
  );
}

/** Claim before presenting so tab changes and process restarts cannot repeat the prompt. */
export async function claimTripStartPrompt(collectorId: string, routeId: string): Promise<boolean> {
  const database = await getDatabase();
  const result = await database.runAsync(
    'INSERT OR IGNORE INTO driver_trip_start_prompts (collector_id, route_id, prompt_day) VALUES (?, ?, ?)',
    collectorId, routeId, monitoringDay(),
  );
  return result.changes === 1;
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
  const enabled = !trackingSuppressed && Boolean(config) && await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
  const detection = await readDetection();
  const signal = !status.lastCheckedAt || Date.now() - Date.parse(status.lastCheckedAt) > ROUTE_MAX_FIX_AGE_MS ? 'stale' : detection.signal;
  // Status reads never restart tracking. Foreground auto-arm checks consent,
  // today's pause, permissions and the current assignment before doing that.
  return { ...status, routeId: config?.routeId ?? status.routeId, routeName: config?.routeName ?? status.routeName, enabled, signal, hasEntered: detection.filter.hasEntered };
}

export async function getRouteProximityEvents(routeId: string, limit = 6): Promise<RoutePresenceEvent[]> {
  const database = await getDatabase();
  const rows = await database.getAllAsync<EventRow>(
    `SELECT id, route_id, event_type, occurred_at, latitude, longitude, distance_meters, accuracy_meters
     FROM driver_route_presence_events
     WHERE route_id = ?
     ORDER BY occurred_at DESC, created_at DESC
     LIMIT ?`,
    routeId,
    limit * 3,
  );

  // Filter out any consecutive duplicates of the same event_type (or identical occurred_at)
  const deduped: EventRow[] = [];
  for (const row of rows) {
    if (deduped.length === 0) {
      deduped.push(row);
      continue;
    }
    const prev = deduped[deduped.length - 1];
    // If the next row (chronologically earlier since ordered DESC) has the same event_type, skip it as a duplicate
    if (prev.event_type === row.event_type) {
      continue;
    }
    deduped.push(row);
    if (deduped.length >= limit) break;
  }

  return deduped.map((row) => ({
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
    JSON.stringify(routePath ?? null),
    new Date().toISOString(),
  );
}

export function enableRouteProximityTracking(config: RouteTrackingConfig, { requestPermissions = true }: { requestPermissions?: boolean } = {}): Promise<RouteTrackingSetupResult> {
  const generation = trackingGeneration;
  return serializeTracking(async () => {
    const cancelled = () => generation !== trackingGeneration;
    const unavailable = (message: string) => ({ enabled: false, message });
    const permissionDenied = async (message: string) => {
      trackingSuppressed = true;
      const database = await getDatabase();
      await database.execAsync('DELETE FROM driver_route_tracking_config; DELETE FROM driver_route_detection; DELETE FROM driver_route_presence_state;');
      await finishDriverTrailSession();
      if (await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK)) await Location.stopLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
      return unavailable(message);
    };
    if (cancelled()) return unavailable('Monitoring was stopped.');
    if (Platform.OS === 'web') return unavailable('Route monitoring is available only in the Android or iOS app.');
    if (!await TaskManager.isAvailableAsync()) return unavailable('Use a rebuilt development app to run route monitoring in the background.');
    if (!config.collectorId || !config.routeId) return unavailable('An assigned route and signed-in driver are required to start a trip.');
    if (AppState.currentState !== 'active') return unavailable('Open the app before enabling route monitoring.');

    let foreground = await Location.getForegroundPermissionsAsync();
    if (foreground.status !== 'granted' && requestPermissions) foreground = await Location.requestForegroundPermissionsAsync();
    if (cancelled()) return unavailable('Monitoring was stopped.');
    if (foreground.status !== 'granted') return permissionDenied('Location permission is required to monitor your assigned route.');
    let background = await Location.getBackgroundPermissionsAsync();
    if (background.status !== 'granted' && requestPermissions) background = await Location.requestBackgroundPermissionsAsync();
    if (cancelled()) return unavailable('Monitoring was stopped.');
    if (background.status !== 'granted') return permissionDenied('Allow location all the time in Settings, then enable automatic route monitoring.');
    if (AppState.currentState !== 'active') return unavailable('Return to the app to start automatic route monitoring.');

    const database = await getDatabase();
    const previous = await getConfig();
    const running = await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
    const sameRoute = previous?.collectorId === config.collectorId && previous?.routeId === config.routeId
      && JSON.stringify(previous?.routePath ?? null) === JSON.stringify(config.routePath ?? null);
    try {
      const existingDetector = await database.getFirstAsync<{ id: number }>('SELECT id FROM driver_route_detection WHERE id = 1');
      if (!running || !sameRoute || !existingDetector) {
        await finishDriverTrailSession();
        await database.execAsync('DELETE FROM driver_route_presence_state; DELETE FROM driver_route_detection;');
        await database.runAsync(
          'INSERT INTO driver_route_detection (id, filter_json, signal, armed_at) VALUES (1, ?, ?, ?)',
          JSON.stringify(emptyPresenceFilter()), 'confirming', Date.now(),
        );
      }
      if (cancelled()) return unavailable('Monitoring was stopped.');
      trackingSuppressed = false;
      await persistRouteTrackingConfig(config);
      if (!running) {
        await Location.startLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK, {
          accuracy: Location.Accuracy.High,
          timeInterval: 5_000,
          distanceInterval: 0,
          deferredUpdatesDistance: 0,
          deferredUpdatesInterval: 5_000,
          foregroundService: {
            notificationBody: 'Recording your trip, including outside the assigned route, while minimized or offline.',
            notificationTitle: 'ResiKlean automatic route monitoring',
            killServiceOnDestroy: false,
          },
          pausesUpdatesAutomatically: false,
          showsBackgroundLocationIndicator: true,
        });
      }
      if (cancelled()) return unavailable('Monitoring was stopped.');
      // Do not await a processing operation while holding its serialization slot.
      void Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
        .then(location => processDriverRouteLocation(location, config, generation)).catch(() => {});
      emitStatus({ ...(await getStoredStatus()), routeId: config.routeId, routeName: config.routeName, enabled: true, signal: (await readDetection()).signal });
      return { enabled: true, message: 'Trip recording is on. Route entry is detected separately.' };
    } catch {
      await database.execAsync('DELETE FROM driver_route_tracking_config; DELETE FROM driver_route_detection; DELETE FROM driver_route_presence_state;');
      await finishDriverTrailSession();
      if (await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK)) {
        await Location.stopLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
      }
      return unavailable('Android could not start route monitoring. Open the app and try Enable again.');
    }
  });
}

export async function updateRouteProximityTracking(config: RouteTrackingConfig) {
  const generation = trackingGeneration;
  const status = await getRouteProximityStatus();
  if (!status.enabled || generation !== trackingGeneration || trackingSuppressed) return false;
  const result = await enableRouteProximityTracking(config, { requestPermissions: false });
  return result.enabled;
}

export function stopRouteProximityTracking({ forgetConfiguration = false }: { forgetConfiguration?: boolean } = {}) {
  // Invalidate pending permission/setup work and already-delivered location batches.
  trackingGeneration += 1;
  trackingSuppressed = true;
  return serializeTracking(async () => {
    const database = await getDatabase();
    // Delete the live configuration even if native teardown fails: no more points
    // can be recorded, and a status poll cannot silently restart the service.
    await database.execAsync('DELETE FROM driver_route_tracking_config; DELETE FROM driver_route_detection;');
    if (forgetConfiguration) await database.execAsync('DELETE FROM driver_route_presence_state;');
    await finishDriverTrailSession();
    if (Platform.OS !== 'web' && await Location.hasStartedLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK)) {
      await Location.stopLocationUpdatesAsync(DRIVER_ROUTE_PROXIMITY_TASK);
    }
    emitStatus({ enabled: false, state: 'unknown' });
  });
}

export async function clearRouteProximityEvents(routeId?: string) {
  const database = await getDatabase();
  if (routeId) {
    await database.runAsync('DELETE FROM driver_route_presence_events WHERE route_id = ?', routeId);
  } else {
    await database.execAsync('DELETE FROM driver_route_presence_events;');
  }
}

