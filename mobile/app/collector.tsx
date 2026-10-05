import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, AppState, Image, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { io } from 'socket.io-client';
import Svg, { Circle } from 'react-native-svg';
import Mapbox from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import { AppText as Text } from '@/components/app-text';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { Card } from 'heroui-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteOfflineRouteMap, downloadOfflineRouteMap, getOfflineRouteMapStatus, type OfflineRouteMapStatus } from '@/lib/driver-offline-map';
import { enableDriverGeofencing, getDriverGeofencingStatus, stopDriverGeofencing, updateDriverGeofences } from '@/lib/driver-geofencing';
import { getRouteLogQueueStats, subscribeToRouteLogSync, syncRouteLogQueue, type RouteLogSyncResult } from '@/lib/driver-route-log-queue';
import { cacheAssignedRoute, clearCachedAssignedRoute, enableRouteProximityTracking, getCachedAssignedRoute, getRouteProximityEvents, getRouteProximityStatus, ROUTE_ENTER_TOLERANCE_METERS, ROUTE_EXIT_TOLERANCE_METERS, stopRouteProximityTracking, subscribeToRouteProximityStatus, updateRouteProximityTracking, type RoutePresenceEvent, type RoutePresenceStatus } from '@/lib/driver-route-proximity';
import { clearSession, getSession, type AccountUser, type AuthSession } from '@/lib/session';

type CollectorTab = 'map' | 'history' | 'profile';

type Street = {
  id: string;
  name: string;
  barangay: string;
  status: 'Collected' | 'Pending';
  time?: string;
  flaggedForReview?: boolean;
};

type RouteStop = {
  _id: string;
  name: string;
  latitude: number;
  longitude: number;
  order: number;
};

type RoutePath = {
  type: 'LineString' | 'MultiLineString';
  coordinates: unknown;
};

type RouteLineFeature = {
  type: 'Feature';
  properties: Record<string, never>;
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'MultiLineString'; coordinates: [number, number][][] };
};

type DriverRoute = {
  _id: string;
  name: string;
  barangay: string | string[];
  schedule: number[];
  stops: RouteStop[];
  routePath?: RoutePath;
};

type RouteLog = {
  _id: string;
  stopId: string;
  collectedAt: string;
  exitedAt?: string;
  status: 'collected';
  flaggedForReview?: boolean;
};

type RouteProgress = {
  routeName: string;
  totalStops: number;
  completed: number;
  remaining: number;
  logs: RouteLog[];
};

type DriverLocation = {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  updatedAt: string;
};

type ComplaintMarker = {
  _id: string;
  barangay: string;
  description: string;
  photoUrl?: string | null;
  status: string;
  createdAt: string;
  residentId?: { name?: string } | string;
  photoMetadata?: {
    capturedAt?: string;
    latitude?: number;
    longitude?: number;
    accuracy?: number;
    width?: number;
    height?: number;
    fileSize?: number;
    mimeType?: string;
  };
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

function isUsableProofAsset(asset?: ImagePicker.ImagePickerAsset | null): asset is ImagePicker.ImagePickerAsset {
  return Boolean(asset?.uri && (!asset.mimeType || asset.mimeType.startsWith('image/')));
}

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.replace(/\/$/, '') || API_URL?.replace(/\/api\/?$/, '');
const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
const MAP_CENTER: [number, number] = [123.1815, 13.6192];

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function displayShift(shift?: AccountUser['shift']) {
  return shift === 'night' ? 'Night Shift' : 'Day Shift';
}

function displayBarangay(barangay?: string | string[]) {
  return Array.isArray(barangay) ? barangay.filter(Boolean).join(', ') : barangay || '';
}

function normalizeCoordinate(value: unknown): [number, number] | null {
  if (!Array.isArray(value) || value.length < 2) return null;

  const longitude = Number(value[0]);
  const latitude = Number(value[1]);
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return null;

  return [longitude, latitude];
}

function normalizeLineCoordinates(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeCoordinate)
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);
}

function routeLineFeature(routePath?: RoutePath): RouteLineFeature | null {
  if (!routePath || !Array.isArray(routePath.coordinates)) return null;

  if (routePath.type === 'LineString') {
    const coordinates = normalizeLineCoordinates(routePath.coordinates);
    return coordinates.length >= 2
      ? { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }
      : null;
  }

  if (routePath.type === 'MultiLineString') {
    const coordinates = routePath.coordinates
      .map(normalizeLineCoordinates)
      .filter((line) => line.length >= 2);
    return coordinates.length > 0
      ? { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates } }
      : null;
  }

  return null;
}

function firstRouteCoordinate(feature: RouteLineFeature | null): [number, number] | null {
  if (!feature) return null;
  if (feature.geometry.type === 'LineString') return feature.geometry.coordinates[0] || null;
  return feature.geometry.coordinates[0]?.[0] || null;
}

function formatTime(date?: string) {
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
}

function formatStorage(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

function ShiftPills({ hasRoute, shift }: { hasRoute: boolean; shift?: AccountUser['shift'] }) {
  return (
    <View style={styles.shiftPills}>
      <View style={styles.shiftPill}><Text style={styles.shiftPillText}>{displayShift(shift)}</Text></View>
      <View style={styles.wastePill}><Feather color="#60df96" name="map" size={13} /><Text style={styles.wastePillText}>{hasRoute ? 'Route assigned' : 'No route today'}</Text></View>
    </View>
  );
}

function SyncBadge({ hasError, isLoading }: { hasError: boolean; isLoading: boolean }) {
  const label = hasError ? 'Refresh failed' : isLoading ? 'Syncing…' : 'Live data';
  const icon = hasError ? 'alert-circle' : isLoading ? 'refresh-cw' : 'wifi';
  const color = hasError ? '#ffb4a8' : '#f1db5d';

  return <View style={styles.pendingBadge}><Feather color={color} name={icon} size={12} /><Text style={styles.pendingText}>{label}</Text></View>;
}

function StandardHeader({ barangay, hasError, hasRoute, isLoading, shift }: { barangay: string; hasError: boolean; hasRoute: boolean; isLoading: boolean; shift?: AccountUser['shift'] }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.standardHeader, { paddingTop: 11 + insets.top }]}>
      <View>
        <Text style={styles.barangayTitle}>{barangay}</Text>
        <ShiftPills hasRoute={hasRoute} shift={shift} />
      </View>
      <SyncBadge hasError={hasError} isLoading={isLoading} />
    </View>
  );
}

function HistoryHeader({ hasError, isLoading, route, shift }: { hasError: boolean; isLoading: boolean; route: DriverRoute | null; shift?: AccountUser['shift'] }) {
  const insets = useSafeAreaInsets();
  const stopNames = route?.stops.slice(0, 3).map((stop) => stop.name).join(', ') || 'No collection route scheduled today';

  return (
    <View style={[styles.historyHeader, { paddingTop: 10 + insets.top }]}>
      <View style={styles.historyHeaderTop}>
        <View>
          <Text style={styles.assignedLabel}>TODAY'S ROUTE</Text>
          <View style={styles.areaNameRow}><Feather color="#58dca2" name="map-pin" size={17} /><Text numberOfLines={1} style={styles.areaName}>{route?.name || 'No active route'}</Text></View>
          <Text numberOfLines={1} style={styles.streetSubtitle}>{route?.barangay ? `${displayBarangay(route.barangay)} · ${stopNames}` : stopNames}</Text>
        </View>
        <SyncBadge hasError={hasError} isLoading={isLoading} />
      </View>
      <ShiftPills hasRoute={Boolean(route)} shift={shift} />
    </View>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: CollectorTab; onChange: (tab: CollectorTab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs: Array<{ key: CollectorTab; label: string; icon: 'map-pin' | 'clock' | 'user' }> = [
    { key: 'map', label: 'Map', icon: 'map-pin' },
    { key: 'history', label: "Today's route", icon: 'clock' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <View style={[styles.bottomNav, { height: 70 + insets.bottom, paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.key} onPress={() => onChange(tab.key)} style={styles.navItem}><Feather color={active ? '#07815f' : '#a0aaa5'} name={tab.icon} size={18} /><Text style={[styles.navText, active && styles.navTextActive]}>{tab.label}</Text>{active ? <View style={styles.navIndicator} /> : <View style={styles.navIndicatorPlaceholder} />}</Pressable>;
      })}
    </View>
  );
}

function ProgressRing({ percent }: { percent: number }) {
  const size = 59;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.min(100, Math.max(0, percent));
  return (
    <View style={styles.progressRing}>
      <Svg height={size} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="#5aa687" strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} rotation="-90" stroke="#d2ffe8" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * (1 - clampedPercent / 100)} strokeLinecap="round" strokeWidth={stroke} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={styles.progressPercent}>{Math.round(clampedPercent)}%</Text>
    </View>
  );
}

function StreetRow({ street }: { street: Street }) {
  const collected = street.status === 'Collected';
  const statusLabel = street.flaggedForReview ? 'Collected · Review' : street.status;
  return (
    <Card style={styles.streetCard}>
      <View style={[styles.streetMarker, street.flaggedForReview ? styles.reviewMarker : collected ? styles.collectedMarker : styles.notCollectedMarker]} />
      <View style={styles.streetInfo}>
        <Text style={styles.streetName}>{street.name}</Text>
        <Text style={styles.streetBarangay}>{street.barangay}</Text>
      </View>
      <View style={[styles.streetStatus, collected ? styles.collectedPill : styles.notCollectedPill]}>
        <Text style={[styles.streetStatusText, collected ? styles.collectedText : styles.notCollectedText]}>• {statusLabel}</Text>
        <Text style={[styles.streetTime, collected ? styles.collectedText : styles.notCollectedText]}>{street.time || '—'}</Text>
      </View>
    </Card>
  );
}

function AccountDetail({ label, value }: { label: string; value: string }) {
  return <View style={styles.accountRow}><Text style={styles.accountLabel}>{label}</Text><Text style={styles.accountValue}>{value}</Text></View>;
}

export default function CollectorScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CollectorTab>('history');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [driver, setDriver] = useState<AccountUser | null>(null);
  const [assignedRoute, setAssignedRoute] = useState<DriverRoute | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeofencingEnabled, setIsGeofencingEnabled] = useState(false);
  const [isUpdatingGeofence, setIsUpdatingGeofence] = useState(false);
  const [geofencingMessage, setGeofencingMessage] = useState<string | null>(null);
  const [routePresence, setRoutePresence] = useState<RoutePresenceStatus>({ enabled: false, state: 'unknown' });
  const [routePresenceEvents, setRoutePresenceEvents] = useState<RoutePresenceEvent[]>([]);
  const [offlineMap, setOfflineMap] = useState<OfflineRouteMapStatus>({ completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 });
  const [isUpdatingOfflineMap, setIsUpdatingOfflineMap] = useState(false);
  const [offlineMapMessage, setOfflineMapMessage] = useState<string | null>(null);
  const [isCapacityPanelExpanded, setIsCapacityPanelExpanded] = useState(true);
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [pendingRouteLogs, setPendingRouteLogs] = useState(0);
  const [failedRouteLogs, setFailedRouteLogs] = useState(0);
  const [complaints, setComplaints] = useState<ComplaintMarker[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintMarker | null>(null);
  const [pendingProofAsset, setPendingProofAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isOpeningProofCamera, setIsOpeningProofCamera] = useState(false);
  const [isResolvingComplaint, setIsResolvingComplaint] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState<string | null>(null);
  const [isResolutionSuccessVisible, setIsResolutionSuccessVisible] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const restorePendingProofPhoto = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (cancelled || !pendingResult || 'code' in pendingResult || pendingResult.canceled) return;
        const recoveredAsset = pendingResult.assets?.[0];
        if (!isUsableProofAsset(recoveredAsset)) return;
        setPendingProofAsset(recoveredAsset);
        setComplaintMessage('Proof photo recovered after returning from the camera.');
      } catch {
        // The camera result is optional until the driver taps resolve again.
      }
    };

    void restorePendingProofPhoto();
    return () => { cancelled = true; };
  }, []);

  const loadDriverData = useCallback(async (token: string, cachedCollectorId?: string) => {
    if (!API_URL) {
      setLoadError('EXPO_PUBLIC_API_URL is not configured.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const request = async (path: string) => {
        const response = await fetch(`${API_URL}${path}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const payload = await response.json().catch(() => ({ success: false, error: 'The server returned an invalid response.' }));
        return { payload, response };
      };

      const [profileResult, routeResult, progressResult] = await Promise.all([
        request('/auth/me'),
        request('/collector/route'),
        request('/collector/route/progress'),
      ]);
      const profilePayload = profileResult.payload as ApiResponse<AccountUser>;
      const routePayload = routeResult.payload as ApiResponse<DriverRoute>;
      const progressPayload = progressResult.payload as ApiResponse<RouteProgress>;
      const errors: string[] = [];

      if (profileResult.response.ok && profilePayload.success && profilePayload.data) {
        setDriver(profilePayload.data);
      } else {
        errors.push(profilePayload.error || 'Unable to load your driver profile.');
      }

      if (routeResult.response.status === 404) {
        setAssignedRoute(null);
        setProgress(null);
        await clearCachedAssignedRoute(cachedCollectorId);
      } else if (routeResult.response.ok && routePayload.success && routePayload.data) {
        setAssignedRoute(routePayload.data);
        if (cachedCollectorId) await cacheAssignedRoute(cachedCollectorId, routePayload.data);
        if (progressResult.response.ok && progressPayload.success && progressPayload.data) {
          setProgress(progressPayload.data);
        } else {
          setProgress(null);
          errors.push(progressPayload.error || 'Unable to load today\'s progress.');
        }
      } else {
        setAssignedRoute(null);
        setProgress(null);
        errors.push(routePayload.error || 'Unable to load today\'s route.');
      }

      setLoadError(errors.length ? errors[0] : null);
    } catch {
      let cachedRoute: DriverRoute | null = null;
      try {
        cachedRoute = cachedCollectorId ? await getCachedAssignedRoute<DriverRoute>(cachedCollectorId) : null;
      } catch {
        // Keep the network error below if the local cache cannot be opened.
      }
      if (cachedRoute) {
        setAssignedRoute(cachedRoute);
        setProgress(null);
        setLoadError('You are offline. Showing your last downloaded route.');
      } else {
        setLoadError('Unable to reach the server. Check your connection and refresh.');
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadComplaints = useCallback(async (token: string) => {
    if (!API_URL) return;

    try {
      const response = await fetch(`${API_URL}/collector/complaints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({ success: false, data: [] }));
      if (!response.ok || !payload.success) {
        // A missing route or an older deployed API should not prevent the
        // assigned route itself from rendering on the driver's map.
        if (response.status === 404) setComplaints([]);
        return;
      }

      const nextComplaints = (Array.isArray(payload.data) ? payload.data : []) as ComplaintMarker[];
      setComplaints(nextComplaints.filter((complaint) => {
        const latitude = Number(complaint.photoMetadata?.latitude);
        const longitude = Number(complaint.photoMetadata?.longitude);
        return Number.isFinite(latitude) && Number.isFinite(longitude) && Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180;
      }));
    } catch {
      // Complaint markers are optional. Keep the route map usable offline.
    }
  }, []);

  useEffect(() => {
    if (!session?.token || !assignedRoute) {
      setComplaints([]);
      return undefined;
    }

    void loadComplaints(session.token);
    const refreshInterval = setInterval(() => { void loadComplaints(session.token); }, 30_000);
    return () => clearInterval(refreshInterval);
  }, [assignedRoute?._id, loadComplaints, session?.token]);

  useEffect(() => {
    if (!session?.token || !assignedRoute || !SOCKET_URL) return undefined;

    const socket = io(SOCKET_URL, { auth: { token: session.token } });
    const refreshComplaints = () => { void loadComplaints(session.token); };
    socket.on('complaint:status-updated', refreshComplaints);

    return () => {
      socket.off('complaint:status-updated', refreshComplaints);
      socket.disconnect();
    };
  }, [assignedRoute?._id, loadComplaints, session?.token]);

  useEffect(() => {
    let isMounted = true;
    getSession().then((savedSession) => {
      if (!savedSession) {
        router.replace('/login');
        return;
      }
      if (isMounted) {
        setSession(savedSession);
        void loadDriverData(savedSession.token, savedSession.user._id || savedSession.user.id);
      }
    }).catch(() => router.replace('/login'));
    return () => { isMounted = false; };
  }, [loadDriverData, router]);

  useEffect(() => {
    if (!session?.token) return undefined;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void loadDriverData(session.token, session.user._id || session.user.id);
    });
    return () => subscription.remove();
  }, [loadDriverData, session?.token]);

  useEffect(() => {
    if (!assignedRoute || activeTab !== 'map' || Platform.OS === 'web') {
      setDriverLocation(null);
      return undefined;
    }

    let isMounted = true;
    let isStarting = false;
    let watcher: Location.LocationSubscription | null = null;

    const updateLocation = (location: Location.LocationObject) => {
      if (!isMounted) return;
      setDriverLocation({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        updatedAt: new Date().toISOString(),
      });
    };

    const startWatching = async () => {
      if (isStarting || !isMounted || AppState.currentState !== 'active') return;
      isStarting = true;

      try {
        const existingPermission = await Location.getForegroundPermissionsAsync();
        const permission = existingPermission.status === 'granted'
          ? existingPermission
          : await Location.requestForegroundPermissionsAsync();

        if (!isMounted || permission.status !== 'granted' || AppState.currentState !== 'active') return;

        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        updateLocation(current);

        if (!isMounted || AppState.currentState !== 'active') return;
        const nextWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 5, timeInterval: 3_000 },
          updateLocation,
        );
        if (!isMounted || AppState.currentState !== 'active') {
          nextWatcher.remove();
        } else {
          watcher = nextWatcher;
        }
      } catch {
        // Location is optional for rendering the assigned route. If permission
        // or the device GPS is unavailable, keep the route map usable.
      } finally {
        isStarting = false;
      }
    };

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void startWatching();
      } else {
        watcher?.remove();
        watcher = null;
      }
    });

    void startWatching();

    return () => {
      isMounted = false;
      watcher?.remove();
      appStateSubscription.remove();
    };
  }, [activeTab, assignedRoute?._id]);

  const profile = driver || session?.user || null;
  const collectorName = profile?.name?.trim() || 'Driver';
  const initial = collectorName.charAt(0).toUpperCase();
  const routeStops = assignedRoute?.stops || [];
  const mapStops = useMemo(() => routeStops
    .map((stop) => ({ ...stop, latitude: Number(stop.latitude), longitude: Number(stop.longitude) }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) && Math.abs(stop.latitude) <= 90 && Math.abs(stop.longitude) <= 180), [routeStops]);
  const mapRouteLine = useMemo(() => routeLineFeature(assignedRoute?.routePath), [assignedRoute?.routePath]);
  const completedStopIds = new Set((progress?.logs || []).filter((log) => log.status === 'collected').map((log) => log.stopId));
  const geofenceStops = useMemo(() => mapStops
    .filter((stop) => !(progress?.logs || []).some((log) => log.stopId === stop._id && log.status === 'collected'))
    .map((stop) => ({ id: stop._id, latitude: stop.latitude, longitude: stop.longitude })), [mapStops, progress]);
  const todayStreets: Street[] = routeStops.map((stop) => {
    const log = progress?.logs.find((item) => item.stopId === stop._id && item.status === 'collected');
    return {
      id: stop._id,
      name: stop.name,
      barangay: displayBarangay(assignedRoute?.barangay),
      status: log ? 'Collected' : 'Pending',
      time: formatTime(log?.exitedAt || log?.collectedAt),
      flaggedForReview: log?.flaggedForReview,
    };
  });
  const completed = progress?.completed ?? completedStopIds.size;
  const totalStops = progress?.totalStops ?? routeStops.length;
  const pending = Math.max(0, progress?.remaining ?? totalStops - completedStopIds.size);
  const reviewCount = (progress?.logs || []).filter((log) => log.flaggedForReview).length;
  const progressPercent = totalStops ? (completed / totalStops) * 100 : 0;
  const firstMapStop = mapStops[0];
  const firstRoutePoint = firstRouteCoordinate(mapRouteLine);
  const hasMapFocus = Boolean(firstMapStop || firstRoutePoint);
  const mapCenter: [number, number] = firstMapStop ? [firstMapStop.longitude, firstMapStop.latitude] : firstRoutePoint || MAP_CENTER;
  const cameraCenter: [number, number] = driverLocation ? [driverLocation.longitude, driverLocation.latitude] : mapCenter;
  const barangay = displayBarangay(assignedRoute?.barangay) || profile?.barangay || profile?.location || 'No route assigned';
  const collectorId = session?.user._id || session?.user.id;

  const refreshRoutePresence = useCallback(async () => {
    if (!assignedRoute) {
      setRoutePresence({ enabled: false, state: 'unknown' });
      setRoutePresenceEvents([]);
      setOfflineMap({ completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 });
      return;
    }

    try {
      const [status, events, mapStatus] = await Promise.all([
        getRouteProximityStatus(),
        getRouteProximityEvents(assignedRoute._id),
        getOfflineRouteMapStatus(assignedRoute._id),
      ]);
      setRoutePresence(status.routeId === assignedRoute._id ? status : { enabled: false, state: 'unknown' });
      setRoutePresenceEvents(events);
      setOfflineMap(mapStatus);
    } catch {
      // Route data remains usable even if a local map-pack status cannot be read.
    }
  }, [assignedRoute]);

  useEffect(() => {
    void refreshRoutePresence();
    const unsubscribe = subscribeToRouteProximityStatus((status) => {
      const routeId = assignedRoute?._id;
      if (!routeId || status.routeId !== routeId) return;
      setRoutePresence(status);
      void getRouteProximityEvents(routeId).then(setRoutePresenceEvents).catch(() => undefined);
    });
    const refreshInterval = setInterval(() => { void refreshRoutePresence(); }, 20_000);

    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [assignedRoute?._id, refreshRoutePresence]);

  useEffect(() => {
    const route = assignedRoute;
    const routePath = route?.routePath;
    if (!route || !routePath) return;

    let isMounted = true;
    const refreshTrackedRoute = async () => {
      const status = await getRouteProximityStatus();
      if (!status.enabled) return;
      await updateRouteProximityTracking({ routeId: route._id, routeName: route.name, routePath });
      if (isMounted) void refreshRoutePresence();
    };

    void refreshTrackedRoute();
    return () => { isMounted = false; };
  }, [assignedRoute?._id, assignedRoute?.name, assignedRoute?.routePath, refreshRoutePresence]);

  const applyQueueResult = useCallback((result: RouteLogSyncResult) => {
    setPendingRouteLogs(result.pending);
    setFailedRouteLogs(result.failed);
  }, []);

  useEffect(() => {
    if (!API_URL || !session?.token || !collectorId) return;

    let isMounted = true;
    const context = { apiUrl: API_URL, token: session.token, collectorId };
    const handleSync = (result: RouteLogSyncResult) => {
      if (!isMounted) return;
      applyQueueResult(result);
      if (result.synced) void loadDriverData(session.token, collectorId);
    };

    const unsubscribe = subscribeToRouteLogSync(context, handleSync);
    void getRouteLogQueueStats(collectorId).then((stats) => {
      if (isMounted) {
        setPendingRouteLogs(stats.pending);
        setFailedRouteLogs(stats.failed);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [applyQueueResult, collectorId, loadDriverData, session?.token]);

  useEffect(() => {
    let isMounted = true;

    const syncGeofences = async () => {
      if (isLoading || !session || !API_URL) return;

      try {
        const enabled = await getDriverGeofencingStatus();
        if (!isMounted) return;
        setIsGeofencingEnabled(enabled);

        if (!enabled || loadError) return;
        if (geofenceStops.length) {
          await updateDriverGeofences({ apiUrl: API_URL, stops: geofenceStops });
        } else {
          await stopDriverGeofencing();
          if (isMounted) setIsGeofencingEnabled(false);
        }
      } catch {
        if (isMounted) setGeofencingMessage('Background geofencing could not be updated.');
      }
    };

    void syncGeofences();
    return () => { isMounted = false; };
  }, [geofenceStops, isLoading, loadError, session]);

  const enableBackgroundGeofencing = useCallback(async () => {
    if (!assignedRoute?.routePath || !mapRouteLine) {
      setGeofencingMessage('Load an assigned route before enabling background geofencing.');
      return;
    }

    setIsUpdatingGeofence(true);
    setGeofencingMessage(null);
    try {
      const routeResult = await enableRouteProximityTracking({
        routeId: assignedRoute._id,
        routeName: assignedRoute.name,
        routePath: assignedRoute.routePath,
      });
      let stopMessage = '';
      if (API_URL && geofenceStops.length) {
        const stopResult = await enableDriverGeofencing({ apiUrl: API_URL, stops: geofenceStops });
        setIsGeofencingEnabled(stopResult.enabled);
        stopMessage = stopResult.enabled ? ` Also monitoring ${geofenceStops.length} stop zone${geofenceStops.length === 1 ? '' : 's'}.` : ` Stop zones: ${stopResult.message}`;
      } else {
        setIsGeofencingEnabled(false);
      }
      setGeofencingMessage(`${routeResult.message}${stopMessage}`);
      if (routeResult.enabled && session?.token && collectorId && API_URL) {
        applyQueueResult(await syncRouteLogQueue({ apiUrl: API_URL, token: session.token, collectorId }));
      }
      await refreshRoutePresence();
    } catch {
      setGeofencingMessage('Unable to enable background geofencing.');
    } finally {
      setIsUpdatingGeofence(false);
    }
  }, [API_URL, applyQueueResult, assignedRoute, collectorId, geofenceStops, mapRouteLine, refreshRoutePresence, session?.token]);

  const disableBackgroundGeofencing = useCallback(async () => {
    setIsUpdatingGeofence(true);
    try {
      await Promise.all([
        stopDriverGeofencing({ forgetConfiguration: true }),
        stopRouteProximityTracking({ forgetConfiguration: true }),
      ]);
      setIsGeofencingEnabled(false);
      setRoutePresence({ enabled: false, state: 'unknown' });
      setGeofencingMessage('Route monitoring is off. Existing stop logs will still sync when you reconnect.');
    } catch {
      setGeofencingMessage('Unable to turn off background geofencing.');
    } finally {
      setIsUpdatingGeofence(false);
    }
  }, []);

  const toggleOfflineMap = useCallback(async () => {
    if (!assignedRoute?.routePath) {
      setOfflineMapMessage('An assigned route with a valid road line is required before downloading a map.');
      return;
    }

    setIsUpdatingOfflineMap(true);
    setOfflineMapMessage(null);
    try {
      if (offlineMap.downloaded) {
        await deleteOfflineRouteMap(assignedRoute._id);
        setOfflineMap({ completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 });
        setOfflineMapMessage('Downloaded map removed from this phone.');
      } else {
        const result = await downloadOfflineRouteMap({
          onError: setOfflineMapMessage,
          onProgress: (status) => {
            setOfflineMap(status);
            if (status.downloaded) setOfflineMapMessage('Map downloaded and ready for offline use.');
          },
          routeId: assignedRoute._id,
          routeName: assignedRoute.name,
          routePath: assignedRoute.routePath,
        });
        setOfflineMap(result);
        setOfflineMapMessage(result.downloaded ? 'Map is already downloaded.' : 'Downloading the route map for offline use.');
      }
    } catch (error) {
      setOfflineMapMessage(error instanceof Error ? error.message : 'Unable to download the route map.');
    } finally {
      setIsUpdatingOfflineMap(false);
    }
  }, [assignedRoute, offlineMap.downloaded]);

  const completeSignOut = async () => {
    try {
      await Promise.all([
        stopDriverGeofencing({ forgetConfiguration: true }),
        stopRouteProximityTracking({ forgetConfiguration: true }),
        clearCachedAssignedRoute(collectorId),
      ]);
    } finally {
      await clearSession();
      setSession(null);
      router.replace('/login');
    }
  };

  const signOut = () => setIsSignOutConfirmVisible(true);

  const resolveSelectedComplaint = async () => {
    try {
      if (!selectedComplaint || !session?.token || !API_URL || isResolvingComplaint || isOpeningProofCamera) return;

      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Take a proof photo before marking this resident request as resolved.');
        return;
      }

      let asset = pendingProofAsset;
      if (!asset) {
        if (AppState.currentState !== 'active') {
          setComplaintMessage('Keep the app open while taking the proof photo, then try again.');
          return;
        }

        setIsOpeningProofCamera(true);
        try {
          const result = await ImagePicker.launchCameraAsync({
            allowsEditing: false,
            mediaTypes: ['images'],
            quality: 0.65,
          });
          if (result.canceled) return;
          const capturedAsset = result.assets?.[0];
          if (!isUsableProofAsset(capturedAsset)) {
            throw new Error('The camera did not return a usable photo. Please try again.');
          }
          asset = capturedAsset;
        } finally {
          setIsOpeningProofCamera(false);
        }
      }
      if (!isUsableProofAsset(asset)) throw new Error('The proof photo is unavailable. Please take it again.');
      setPendingProofAsset(null);
      let proofCoordinates: { latitude: number; longitude: number; accuracy?: number } | undefined;
      try {
        const locationPermission = await Location.requestForegroundPermissionsAsync();
        if (locationPermission.granted) {
          const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
          proofCoordinates = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy || undefined,
          };
        }
      } catch {
        // The proof photo remains valid if GPS is temporarily unavailable.
      }

      setIsResolvingComplaint(true);
      setComplaintMessage(null);
      const formData = new FormData();
      formData.append('clientId', `mobile-resolution-${selectedComplaint._id}-${Date.now()}`);
      formData.append('resolutionNote', 'Collected by driver');
      formData.append('photoMetadata', JSON.stringify({
        capturedAt: new Date().toISOString(),
        latitude: proofCoordinates?.latitude,
        longitude: proofCoordinates?.longitude,
        accuracy: proofCoordinates?.accuracy,
        width: asset.width,
        height: asset.height,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType || 'image/jpeg',
      }));
      formData.append('photo', {
        uri: asset.uri,
        name: asset.fileName || `complaint-proof-${selectedComplaint._id}.jpg`,
        type: asset.mimeType || 'image/jpeg',
      } as unknown as Blob);

      const response = await fetch(`${API_URL}/collector/complaints/${selectedComplaint._id}/resolve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData,
      });
      const payload = (await response.json().catch(() => ({ success: false }))) as ApiResponse<ComplaintMarker>;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to resolve this request.');

      setComplaints((current) => current.filter((complaint) => complaint._id !== selectedComplaint._id));
      setSelectedComplaint(null);
      setComplaintMessage(null);
      setIsResolutionSuccessVisible(true);
    } catch (error) {
      setIsOpeningProofCamera(false);
      setComplaintMessage(error instanceof Error ? error.message : 'Unable to capture or upload the proof photo.');
    } finally {
      setIsOpeningProofCamera(false);
      setIsResolvingComplaint(false);
    }
  };

  const mapScreen = (
    <View style={styles.mapScreen}>
      <View style={styles.mapPlaceholder}>
        {MAPBOX_ACCESS_TOKEN ? (
          <Mapbox.MapView style={styles.mapView} styleURL={Mapbox.StyleURL.Street}>
            <Mapbox.Camera centerCoordinate={cameraCenter} zoomLevel={driverLocation ? 14 : hasMapFocus ? 14 : 12} />
            {mapRouteLine ? (
              <Mapbox.ShapeSource id="assigned-route-path" shape={mapRouteLine}>
                <Mapbox.LineLayer id="assigned-route-corridor" style={{ lineCap: 'round', lineColor: '#14A87D', lineJoin: 'round', lineOpacity: 0.18, lineWidth: 18 }} />
                <Mapbox.LineLayer id="assigned-route-line" style={{ lineCap: 'round', lineColor: '#14A87D', lineJoin: 'round', lineOpacity: 0.9, lineWidth: 5 }} />
              </Mapbox.ShapeSource>
            ) : null}
            {driverLocation ? (
              <Mapbox.PointAnnotation
                coordinate={[driverLocation.longitude, driverLocation.latitude]}
                id="driver-current-location"
              >
                <View style={styles.driverLocationMarker}>
                  <Feather color="#ffffff" name="truck" size={20} />
                </View>
              </Mapbox.PointAnnotation>
            ) : null}
            {mapStops.map((stop) => {
              const isCollected = completedStopIds.has(stop._id);
              const needsReview = progress?.logs.some((log) => log.stopId === stop._id && log.flaggedForReview);
              return (
                <Mapbox.PointAnnotation coordinate={[stop.longitude, stop.latitude]} id={stop._id} key={stop._id}>
                  <View style={[styles.mapMarker, needsReview ? styles.mapMarkerReview : isCollected ? styles.mapMarkerCollected : styles.mapMarkerPending]}>
                    <Text style={styles.mapMarkerText}>{stop.order}</Text>
                  </View>
                </Mapbox.PointAnnotation>
              );
            })}
            {complaints.map((complaint) => {
              const latitude = Number(complaint.photoMetadata?.latitude);
              const longitude = Number(complaint.photoMetadata?.longitude);
              return (
                <Mapbox.PointAnnotation
                  coordinate={[longitude, latitude]}
                  id={`complaint-${complaint._id}`}
                  key={`complaint-${complaint._id}`}
                  onSelected={() => setSelectedComplaint(complaint)}
                >
                  <View style={styles.complaintMarker}>
                    <Feather color="#ffffff" name="alert-circle" size={17} />
                  </View>
                </Mapbox.PointAnnotation>
              );
            })}
          </Mapbox.MapView>
        ) : (
          <View style={styles.mapPlaceholderLabel}>
            <Feather color="#c05d36" name="alert-circle" size={17} />
            <Text style={styles.mapPlaceholderText}>Mapbox token is missing</Text>
          </View>
        )}
        {MAPBOX_ACCESS_TOKEN && !isLoading && (loadError || !assignedRoute) && (
          <View style={styles.mapPlaceholderLabel}>
            <Feather color={loadError ? '#c05d36' : '#4d7e69'} name={loadError ? 'alert-circle' : 'map'} size={17} />
            <Text style={styles.mapPlaceholderText}>{loadError || 'No route is scheduled for today.'}</Text>
          </View>
        )}
        {assignedRoute && (
          <View style={styles.geofenceCard}>
            <View style={styles.geofenceHeader}>
              <View style={styles.geofenceStatusRow}>
                <Feather color={routePresence.enabled && routePresence.state === 'on_route' ? '#07815f' : routePresence.enabled ? '#c77d10' : '#68776e'} name={routePresence.enabled ? 'navigation' : 'map-pin'} size={17} />
                <View style={styles.geofenceTextWrap}>
                  <Text style={styles.geofenceTitle}>{routePresence.enabled ? routePresence.state === 'on_route' ? 'On assigned route' : routePresence.state === 'off_route' ? 'Away from assigned route' : 'Finding your route position' : 'Route monitoring off'}</Text>
                  <Text numberOfLines={2} style={styles.geofenceCaption}>{geofencingMessage || (routePresence.enabled ? `${Math.round(routePresence.distanceMeters || 0)} m from the route - last checked ${formatTime(routePresence.lastCheckedAt)}` : `Enable to detect entry within ${ROUTE_ENTER_TOLERANCE_METERS} m and exit beyond ${ROUTE_EXIT_TOLERANCE_METERS} m.`)}</Text>
                </View>
              </View>
              <Pressable accessibilityLabel={routePresence.enabled ? 'Turn off route monitoring' : 'Enable route monitoring'} accessibilityRole="switch" accessibilityState={{ checked: routePresence.enabled, disabled: isUpdatingGeofence }} disabled={isUpdatingGeofence} onPress={() => void (routePresence.enabled ? disableBackgroundGeofencing() : enableBackgroundGeofencing())} style={[styles.monitoringSwitch, routePresence.enabled && styles.monitoringSwitchOn, isUpdatingGeofence && styles.geofenceButtonDisabled]}>
                <View style={[styles.monitoringSwitchThumb, routePresence.enabled && styles.monitoringSwitchThumbOn]} />
              </Pressable>
            </View>
            {pendingRouteLogs > 0 && <Text style={styles.geofenceQueueText}>{pendingRouteLogs} route log{pendingRouteLogs === 1 ? '' : 's'} queued for sync{failedRouteLogs ? ` (${failedRouteLogs} need attention)` : ''}.</Text>}
          </View>
        )}
        {assignedRoute && (
          <View style={styles.capacityFloatingCard}>
            <Pressable accessibilityRole="button" onPress={() => setIsCapacityPanelExpanded((expanded) => !expanded)} style={styles.capacityHeader}>
              <View style={styles.capacityHeaderIcon}><Feather color="#ffffff" name="truck" size={13} /></View>
              <View style={styles.capacityHeaderTextWrap}><Text style={styles.capacityTitle}>Predictive capacity</Text><Text style={styles.capacitySubtitle}>Route load estimate</Text></View>
              <Feather color="#ffffff" name={isCapacityPanelExpanded ? 'chevron-up' : 'chevron-down'} size={15} />
            </Pressable>
            {isCapacityPanelExpanded && (
              <View style={styles.capacityBody}>
                <View style={styles.capacityMetric}><Text style={styles.capacityPercent}>65%</Text><Text style={styles.capacityMetricLabel}>Loaded space</Text></View>
                <View style={styles.capacityProgressTrack}><View style={styles.capacityProgressFill} /></View>
                <Text style={styles.capacityPlaceholder}>Predictive truck capacity will appear here.</Text>
              </View>
            )}
          </View>
        )}
        {complaintMessage ? (
          <View style={styles.complaintToast}>
            <Feather color="#07815f" name="check-circle" size={15} />
            <Text style={styles.complaintToastText}>{complaintMessage}</Text>
          </View>
        ) : null}
        <Modal animationType="slide" onRequestClose={() => setSelectedComplaint(null)} transparent visible={Boolean(selectedComplaint)}>
          <View style={styles.complaintModalBackdrop}>
            <Pressable accessibilityLabel="Close complaint" onPress={() => setSelectedComplaint(null)} style={styles.complaintModalDismissArea} />
            {selectedComplaint ? (
              <View style={styles.complaintSheet}>
                <View style={styles.complaintSheetHeader}>
                  <View style={styles.complaintSheetTitleWrap}>
                    <Text style={styles.complaintSheetEyebrow}>APPROVED RESIDENT REQUEST</Text>
                    <Text style={styles.complaintSheetTitle}>Collection request</Text>
                  </View>
                  <Pressable accessibilityLabel="Close complaint" onPress={() => setSelectedComplaint(null)} style={styles.complaintCloseButton}>
                    <Feather color="#314238" name="x" size={20} />
                  </Pressable>
                </View>
                <ScrollView contentContainerStyle={styles.complaintSheetContent} showsVerticalScrollIndicator={false}>
                  {selectedComplaint.photoUrl ? <Image accessibilityLabel="Resident complaint photo" source={{ uri: selectedComplaint.photoUrl }} style={styles.complaintPhoto} /> : null}
                  <Text style={styles.complaintDescription}>{selectedComplaint.description || 'Resident requested collection at this location.'}</Text>
                  <View style={styles.complaintDetailRow}><Feather color="#07815f" name="map-pin" size={16} /><View style={styles.complaintDetailText}><Text style={styles.complaintDetailLabel}>Exact request location</Text><Text style={styles.complaintDetailValue}>{Number(selectedComplaint.photoMetadata?.latitude).toFixed(6)}, {Number(selectedComplaint.photoMetadata?.longitude).toFixed(6)}</Text><Text style={styles.complaintDetailCaption}>{selectedComplaint.barangay || 'Location captured from resident photo'}</Text></View></View>
                  <View style={styles.complaintDetailRow}><Feather color="#07815f" name="clock" size={16} /><View style={styles.complaintDetailText}><Text style={styles.complaintDetailLabel}>Submitted</Text><Text style={styles.complaintDetailValue}>{formatTime(selectedComplaint.createdAt)}</Text><Text style={styles.complaintDetailCaption}>{selectedComplaint.photoMetadata?.capturedAt ? `Photo captured ${formatTime(selectedComplaint.photoMetadata.capturedAt)}` : 'Photo capture time unavailable'}</Text></View></View>
                  <Pressable disabled={isResolvingComplaint} onPress={() => void resolveSelectedComplaint()} style={[styles.resolveComplaintButton, isResolvingComplaint && styles.geofenceButtonDisabled]}>
                    <Feather color="#ffffff" name="camera" size={17} />
                    <Text style={styles.resolveComplaintButtonText}>{isResolvingComplaint ? 'Uploading proof...' : 'Take proof photo & resolve'}</Text>
                  </Pressable>
                </ScrollView>
              </View>
            ) : null}
          </View>
        </Modal>
        <Modal
          animationType="fade"
          onRequestClose={() => setIsResolutionSuccessVisible(false)}
          statusBarTranslucent
          transparent
          visible={isResolutionSuccessVisible}
        >
          <View style={styles.resolveSuccessBackdrop}>
            <View style={styles.resolveSuccessCard}>
              <View style={styles.resolveSuccessIcon}>
                <Feather color="#07815f" name="check" size={25} />
              </View>
              <Text style={styles.resolveSuccessTitle}>Request resolved</Text>
              <Text style={styles.resolveSuccessMessage}>The proof photo was uploaded successfully.</Text>
              <Pressable onPress={() => setIsResolutionSuccessVisible(false)} style={styles.resolveSuccessButton}>
                <Text style={styles.resolveSuccessButtonText}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );

  const historyScreen = (
    <View style={styles.historyScreen}>
      <HistoryHeader hasError={Boolean(loadError)} isLoading={isLoading} route={assignedRoute} shift={profile?.shift} />
      <ScrollView contentContainerStyle={styles.historyScrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.progressCard}>
          <View><Text style={styles.progressLabel}>TODAY'S PROGRESS</Text><Text style={styles.progressNumber}>{completed} <Text style={styles.progressTotal}>/ {totalStops} stops</Text></Text><Text style={styles.progressCaption}>{pending ? `${pending} stops remaining` : totalStops ? 'Route completed' : 'No route scheduled'}</Text></View>
          <ProgressRing percent={progressPercent} />
        </Card>
        {assignedRoute && <Card style={styles.routePresenceHistoryCard}>
          <View style={styles.routePresenceHistoryHeading}>
            <View><Text style={styles.dateLabel}>ROUTE PRESENCE</Text><Text style={styles.routePresenceHistoryTitle}>Road-route entries and exits</Text></View>
            <View style={[styles.routePresencePill, routePresence.state === 'on_route' ? styles.routePresencePillOn : routePresence.state === 'off_route' ? styles.routePresencePillOff : styles.routePresencePillUnknown]}><Text style={[styles.routePresencePillText, routePresence.state === 'on_route' ? styles.routePresencePillTextOn : routePresence.state === 'off_route' ? styles.routePresencePillTextOff : styles.routePresencePillTextUnknown]}>{routePresence.state === 'on_route' ? 'On route' : routePresence.state === 'off_route' ? 'Off route' : 'Waiting'}</Text></View>
          </View>
          {routePresenceEvents.length ? routePresenceEvents.map((event) => <View key={event.id} style={styles.routePresenceEvent}>
            <View style={[styles.routePresenceEventDot, event.eventType === 'entered' ? styles.routePresenceEventEntered : styles.routePresenceEventLeft]} />
            <View style={styles.routePresenceEventTextWrap}><Text style={styles.routePresenceEventTitle}>{event.eventType === 'entered' ? 'Entered assigned route' : 'Left assigned route'}</Text><Text style={styles.routePresenceEventCaption}>{formatTime(event.occurredAt)} - {Math.round(event.distanceMeters)} m from route{event.accuracyMeters ? ` - GPS ±${Math.round(event.accuracyMeters)} m` : ''}</Text></View>
          </View>) : <Text style={styles.routePresenceEmpty}>Enable route monitoring to record timestamped route-entry and route-exit events, even while offline.</Text>}
        </Card>}
        {assignedRoute && <Card style={styles.offlineMapCard}>
          <View style={styles.offlineMapRow}>
            <View style={styles.offlineMapTextWrap}>
              <Text style={styles.offlineMapTitle}>{offlineMap.downloaded ? 'Offline map ready' : offlineMap.downloading ? `Downloading map - ${offlineMap.percentage}%` : 'Download route map'}</Text>
              <Text numberOfLines={2} style={styles.offlineMapCaption}>{offlineMapMessage || (offlineMap.downloaded ? `${formatStorage(offlineMap.completedSizeBytes)} stored on this phone.` : 'Save this assigned route map for use without mobile data.')}</Text>
            </View>
            <Pressable disabled={isUpdatingOfflineMap} onPress={() => void toggleOfflineMap()} style={[styles.offlineMapButton, offlineMap.downloaded && styles.offlineMapButtonDownloaded, isUpdatingOfflineMap && styles.geofenceButtonDisabled]}>
              <Feather color={offlineMap.downloaded ? '#9d3139' : '#286349'} name={offlineMap.downloaded ? 'trash-2' : 'download'} size={14} />
              <Text style={[styles.offlineMapButtonText, offlineMap.downloaded && styles.offlineMapButtonTextDownloaded]}>{isUpdatingOfflineMap ? 'Working…' : offlineMap.downloaded ? 'Remove' : 'Download'}</Text>
            </Pressable>
          </View>
        </Card>}
        <View style={styles.historyGroup}>
          <Text style={styles.dateLabel}>TODAY'S STOPS</Text>
          {todayStreets.length ? todayStreets.map((street) => <StreetRow key={street.id} street={street} />) : <Text style={styles.emptyStateText}>{isLoading ? 'Loading assigned route…' : loadError || 'No stops are assigned for today.'}</Text>}
        </View>
      </ScrollView>
    </View>
  );

  const profileScreen = (
    <View style={styles.profileScreen}>
      <StandardHeader barangay={barangay} hasError={Boolean(loadError)} hasRoute={Boolean(assignedRoute)} isLoading={isLoading} shift={profile?.shift} />
      <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.collectorProfileCard}>
          <View style={styles.avatar}>{profile?.profilePhotoUrl ? <Image accessibilityLabel="Profile picture" source={{ uri: profile.profilePhotoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initial}</Text>}</View>
          <Text style={styles.collectorName}>{collectorName}</Text>
          <Text style={styles.collectorRole}>Collector · Route Driver</Text>
          <Text style={styles.collectorBarangay}>{barangay}</Text>
          <View style={styles.profilePills}><View style={styles.collectorPill}><Text style={styles.collectorPillText}>Collector</Text></View><View style={styles.onShiftPill}><Text style={styles.onShiftText}>{displayShift(profile?.shift)}</Text></View></View>
        </Card>

        <View style={styles.statsRow}>
          {[[String(completed), 'Collected'], [String(reviewCount), 'For review'], [String(pending), 'Pending']].map(([value, label]) => <Card key={label} style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.statCaption}>stops</Text></Card>)}
        </View>

        <Card style={styles.accountCard}>
          <Text style={styles.accountHeading}>ACCOUNT DETAILS</Text>
          <AccountDetail label="Employee ID" value={profile?.employeeId || 'Not provided'} />
          <AccountDetail label="Contact" value={profile?.contact || profile?.phone || 'Not provided'} />
          <AccountDetail label="Email" value={profile?.email || 'Not provided'} />
          <AccountDetail label="Shift" value={displayShift(profile?.shift)} />
          <AccountDetail label="Assigned route" value={assignedRoute?.name || 'No route scheduled today'} />
        </Card>

        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Feather color="#e23d4f" name="log-out" size={17} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
      <View style={styles.syncBottomBar}><View style={styles.syncBottomTextWrap}><Feather color={loadError ? '#c05d36' : '#07815f'} name={loadError ? 'alert-circle' : 'wifi'} size={15} /><Text style={styles.syncBottomText}>{loadError || (isLoading ? 'Refreshing driver data…' : 'Driver data is up to date')}</Text></View><Pressable disabled={!session || isLoading} onPress={() => session && void loadDriverData(session.token, collectorId)} style={[styles.syncButton, (!session || isLoading) && styles.syncButtonDisabled]}><Text style={styles.syncButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text></Pressable></View>
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <StatusBar backgroundColor="transparent" style="light" translucent />
      <View style={styles.content}>{activeTab === 'map' ? mapScreen : activeTab === 'history' ? historyScreen : profileScreen}</View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f3f6f4' },
  content: { flex: 1 },
  mapScreen: { flex: 1 },
  historyScreen: { flex: 1 },
  profileScreen: { flex: 1 },
  standardHeader: { alignItems: 'flex-start', backgroundColor: '#176b3a', flexDirection: 'row', justifyContent: 'space-between', minHeight: 78, paddingHorizontal: 16, paddingTop: 11 },
  barangayTitle: { color: '#ffffff', fontSize: 14, fontWeight: '800' },
  shiftPills: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 5 },
  shiftPill: { backgroundColor: '#317f58', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 3 },
  shiftPillText: { color: '#d3eadc', fontSize: 9, fontWeight: '700' },
  wastePill: { alignItems: 'center', flexDirection: 'row', gap: 3, paddingVertical: 3 },
  wastePillText: { color: '#74e6a4', fontSize: 9, fontWeight: '800' },
  pendingBadge: { alignItems: 'center', backgroundColor: '#5d651e', borderColor: '#8d8a2c', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 4, marginTop: 5, paddingHorizontal: 8, paddingVertical: 5 },
  pendingText: { color: '#f2e278', fontSize: 9, fontWeight: '800' },
  mapPlaceholder: { backgroundColor: '#dbe7df', flex: 1, overflow: 'hidden', position: 'relative' },
  mapView: { flex: 1 },
  mapMarker: { alignItems: 'center', borderColor: '#ffffff', borderRadius: 14, borderWidth: 2, height: 28, justifyContent: 'center', width: 28 },
  mapMarkerCollected: { backgroundColor: '#13b981' },
  mapMarkerPending: { backgroundColor: '#7f8b84' },
  mapMarkerReview: { backgroundColor: '#8d53ce' },
  mapMarkerText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  driverLocationMarker: { alignItems: 'center', backgroundColor: '#1976e8', borderColor: '#ffffff', borderRadius: 24, borderWidth: 3, height: 48, justifyContent: 'center', shadowColor: '#0d3c79', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, width: 48 },
  complaintMarker: { alignItems: 'center', backgroundColor: '#d44859', borderColor: '#ffffff', borderRadius: 20, borderWidth: 3, height: 38, justifyContent: 'center', shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, width: 38 },
  mapPlaceholderLabel: { alignItems: 'center', backgroundColor: 'rgba(248,252,249,0.88)', borderColor: '#c2d3c9', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, left: 20, paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', right: 20, top: '47%' },
  mapPlaceholderText: { color: '#45685a', fontSize: 11, fontWeight: '700' },
  geofenceCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#cfe2d8', borderRadius: 13, borderWidth: 1, bottom: 12, left: 12, padding: 10, position: 'absolute', right: 12, shadowColor: '#234837', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
  geofenceHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, justifyContent: 'space-between' },
  geofenceStatusRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 8 },
  geofenceTextWrap: { flex: 1 },
  geofenceTitle: { color: '#345345', fontSize: 11, fontWeight: '800' },
  geofenceCaption: { color: '#6d7d74', fontSize: 9, lineHeight: 13, marginTop: 2 },
  geofenceButton: { backgroundColor: '#07815f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  geofenceButtonEnabled: { backgroundColor: '#edf6f1', borderColor: '#82b49d', borderWidth: 1 },
  geofenceButtonDisabled: { opacity: 0.62 },
  geofenceButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  geofenceButtonTextEnabled: { color: '#286349' },
  monitoringSwitch: { backgroundColor: '#d7e1db', borderRadius: 14, height: 27, justifyContent: 'center', paddingHorizontal: 3, width: 48 },
  monitoringSwitchOn: { backgroundColor: '#14a87d' },
  monitoringSwitchThumb: { backgroundColor: '#ffffff', borderRadius: 11, height: 21, shadowColor: '#244738', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.16, shadowRadius: 2, width: 21 },
  monitoringSwitchThumbOn: { alignSelf: 'flex-end' },
  geofenceQueueText: { color: '#9b6816', fontSize: 9, fontWeight: '700', marginTop: 7 },
  capacityFloatingCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#d4e3db', borderRadius: 13, overflow: 'hidden', position: 'absolute', right: 12, shadowColor: '#234837', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.16, shadowRadius: 8, top: 82, width: 190 },
  capacityHeader: { alignItems: 'center', backgroundColor: '#07815f', flexDirection: 'row', gap: 7, paddingHorizontal: 9, paddingVertical: 8 },
  capacityHeaderIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 10, height: 21, justifyContent: 'center', width: 21 },
  capacityHeaderTextWrap: { flex: 1 },
  capacityTitle: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  capacitySubtitle: { color: '#c6f0dc', fontSize: 9, marginTop: 2 },
  capacityBody: { padding: 11 },
  capacityMetric: { alignItems: 'baseline', flexDirection: 'row', gap: 5 },
  capacityPercent: { color: '#263f33', fontSize: 25, fontWeight: '800' },
  capacityMetricLabel: { color: '#718279', fontSize: 10 },
  capacityProgressTrack: { backgroundColor: '#e4eee9', borderRadius: 4, height: 8, marginTop: 7, overflow: 'hidden' },
  capacityProgressFill: { backgroundColor: '#14a87d', borderRadius: 4, height: '100%', width: '65%' },
  capacityPlaceholder: { color: '#87948d', fontSize: 10, lineHeight: 14, marginTop: 7 },
  complaintToast: { alignItems: 'center', backgroundColor: '#e8fbf1', borderColor: '#b9dfca', borderRadius: 12, borderWidth: 1, bottom: 102, flexDirection: 'row', gap: 7, left: 14, maxWidth: '78%', paddingHorizontal: 11, paddingVertical: 9, position: 'absolute', shadowColor: '#234837', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.14, shadowRadius: 6 },
  complaintToastText: { color: '#286349', flex: 1, fontSize: 10, fontWeight: '800' },
  complaintModalBackdrop: { backgroundColor: 'rgba(20, 42, 31, 0.3)', flex: 1, justifyContent: 'flex-end' },
  complaintModalDismissArea: { flex: 1 },
  complaintSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '76%', overflow: 'hidden', paddingHorizontal: 16, paddingTop: 16 },
  complaintSheetHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  complaintSheetTitleWrap: { flex: 1 },
  complaintSheetEyebrow: { color: '#07815f', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  complaintSheetTitle: { color: '#243f31', fontSize: 18, fontWeight: '800', marginTop: 3 },
  complaintCloseButton: { alignItems: 'center', height: 36, justifyContent: 'center', width: 36 },
  complaintSheetContent: { paddingBottom: 26, paddingTop: 14 },
  complaintPhoto: { backgroundColor: '#eef4f0', borderRadius: 14, height: 180, width: '100%' },
  complaintDescription: { color: '#294236', fontSize: 14, lineHeight: 21, marginTop: 13 },
  complaintDetailRow: { alignItems: 'flex-start', borderTopColor: '#e5eee8', borderTopWidth: 1, flexDirection: 'row', gap: 10, marginTop: 13, paddingTop: 12 },
  complaintDetailText: { flex: 1 },
  complaintDetailLabel: { color: '#667970', fontSize: 10, fontWeight: '800' },
  complaintDetailValue: { color: '#294236', fontSize: 12, fontWeight: '700', marginTop: 2 },
  complaintDetailCaption: { color: '#89978f', fontSize: 10, marginTop: 2 },
  resolveComplaintButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, flexDirection: 'row', gap: 8, justifyContent: 'center', marginTop: 18, minHeight: 48, paddingHorizontal: 14 },
  resolveComplaintButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  resolveSuccessBackdrop: { alignItems: 'center', backgroundColor: 'rgba(10, 31, 22, 0.48)', flex: 1, justifyContent: 'center', padding: 24 },
  resolveSuccessCard: { alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 22, maxWidth: 340, paddingHorizontal: 24, paddingVertical: 25, shadowColor: '#123b2b', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 18, width: '100%' },
  resolveSuccessIcon: { alignItems: 'center', backgroundColor: '#e5f7ef', borderRadius: 32, height: 58, justifyContent: 'center', width: 58 },
  resolveSuccessTitle: { color: '#173b2d', fontSize: 19, fontWeight: '800', marginTop: 14 },
  resolveSuccessMessage: { color: '#668075', fontSize: 13, lineHeight: 19, marginTop: 7, textAlign: 'center' },
  resolveSuccessButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, marginTop: 20, minHeight: 44, justifyContent: 'center', paddingHorizontal: 30, width: '100%' },
  resolveSuccessButtonText: { color: '#ffffff', fontSize: 13, fontWeight: '800' },
  offlineMapCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 15, borderWidth: 1, marginTop: 12, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 7 },
  offlineMapRow: { alignItems: 'center', borderTopColor: '#e3ece6', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 9, paddingTop: 9 },
  offlineMapTextWrap: { flex: 1 },
  offlineMapTitle: { color: '#345345', fontSize: 10, fontWeight: '800' },
  offlineMapCaption: { color: '#78877f', fontSize: 9, marginTop: 2 },
  offlineMapButton: { alignItems: 'center', backgroundColor: '#edf6f1', borderColor: '#b6d6c5', borderRadius: 8, borderWidth: 1, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 6 },
  offlineMapButtonDownloaded: { backgroundColor: '#fff3f4', borderColor: '#f0c7cb' },
  offlineMapButtonText: { color: '#286349', fontSize: 9, fontWeight: '800' },
  offlineMapButtonTextDownloaded: { color: '#9d3139' },
  historyHeader: { backgroundColor: '#176b3a', paddingBottom: 11, paddingHorizontal: 16, paddingTop: 10 },
  historyHeaderTop: { flexDirection: 'row', justifyContent: 'space-between' },
  assignedLabel: { color: '#9bc6ad', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  areaNameRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 4 },
  areaName: { color: '#ffffff', fontSize: 19, fontWeight: '800' },
  streetSubtitle: { color: '#a3c9b3', fontSize: 9, marginTop: 3, maxWidth: 215 },
  historyScrollContent: { padding: 13, paddingBottom: 89 },
  progressCard: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 15, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 15, paddingVertical: 13, shadowColor: '#0b4b2b', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.13, shadowRadius: 9 },
  progressLabel: { color: '#b9dcc8', fontSize: 10, fontWeight: '800' },
  progressNumber: { color: '#ffffff', fontSize: 27, fontWeight: '800', marginTop: 4 },
  progressTotal: { color: '#cae4d4', fontSize: 14, fontWeight: '700' },
  progressCaption: { color: '#abd1bc', fontSize: 10, marginTop: 2 },
  progressRing: { alignItems: 'center', height: 59, justifyContent: 'center', width: 59 },
  progressPercent: { color: '#ffffff', fontSize: 11, fontWeight: '800', position: 'absolute' },
  routePresenceHistoryCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 15, borderWidth: 1, marginTop: 12, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 7 },
  routePresenceHistoryHeading: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between' },
  routePresenceHistoryTitle: { color: '#3d5246', fontSize: 12, fontWeight: '800', marginTop: -4 },
  routePresencePill: { borderRadius: 9, paddingHorizontal: 8, paddingVertical: 4 },
  routePresencePillOn: { backgroundColor: '#e8fbf1' },
  routePresencePillOff: { backgroundColor: '#fff3df' },
  routePresencePillUnknown: { backgroundColor: '#f0f3f1' },
  routePresencePillText: { fontSize: 9, fontWeight: '800' },
  routePresencePillTextOn: { color: '#07815f' },
  routePresencePillTextOff: { color: '#b66d08' },
  routePresencePillTextUnknown: { color: '#68776e' },
  routePresenceEvent: { alignItems: 'flex-start', borderTopColor: '#eef3f0', borderTopWidth: 1, flexDirection: 'row', gap: 8, marginTop: 10, paddingTop: 10 },
  routePresenceEventDot: { borderRadius: 4, height: 8, marginTop: 3, width: 8 },
  routePresenceEventEntered: { backgroundColor: '#13b981' },
  routePresenceEventLeft: { backgroundColor: '#e5a42f' },
  routePresenceEventTextWrap: { flex: 1 },
  routePresenceEventTitle: { color: '#405147', fontSize: 10, fontWeight: '800' },
  routePresenceEventCaption: { color: '#86938c', fontSize: 9, marginTop: 3 },
  routePresenceEmpty: { color: '#7f8e85', fontSize: 10, lineHeight: 15, marginTop: 11 },
  historyGroup: { marginTop: 16 },
  dateLabel: { color: '#65766c', fontSize: 11, fontWeight: '800', letterSpacing: 0.3, marginBottom: 8 },
  emptyStateText: { color: '#7f8e85', fontSize: 12, lineHeight: 18, paddingVertical: 16, textAlign: 'center' },
  streetCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e1e8e4', borderRadius: 13, borderWidth: 1, flexDirection: 'row', marginBottom: 8, minHeight: 60, paddingHorizontal: 10, shadowColor: '#234837', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 5 },
  streetMarker: { borderRadius: 3, height: 30, width: 5 },
  collectedMarker: { backgroundColor: '#10c990' },
  notCollectedMarker: { backgroundColor: '#aeb8b2' },
  reviewMarker: { backgroundColor: '#8d53ce' },
  streetInfo: { flex: 1, marginLeft: 10 },
  streetName: { color: '#2a4134', fontSize: 12, fontWeight: '800' },
  streetBarangay: { color: '#9aa69f', fontSize: 9, marginTop: 3 },
  streetStatus: { alignItems: 'flex-end', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
  collectedPill: { backgroundColor: '#e8fbf1' },
  notCollectedPill: { backgroundColor: '#f0f3f1' },
  streetStatusText: { fontSize: 9, fontWeight: '800' },
  streetTime: { fontSize: 8, marginTop: 2 },
  collectedText: { color: '#07815f' },
  notCollectedText: { color: '#66766d' },
  profileScrollContent: { padding: 13, paddingBottom: 100 },
  collectorProfileCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, padding: 18, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  avatar: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 27, height: 54, justifyContent: 'center', width: 54 },
  avatarImage: { borderRadius: 27, height: 54, width: 54 },
  avatarText: { color: '#ffffff', fontSize: 23, fontWeight: '800' },
  collectorName: { color: '#2a4033', fontSize: 16, fontWeight: '800', marginTop: 9 },
  collectorRole: { color: '#75857b', fontSize: 10, marginTop: 4 },
  collectorBarangay: { color: '#8d9a93', fontSize: 10, marginTop: 3 },
  profilePills: { flexDirection: 'row', gap: 8, marginTop: 12 },
  collectorPill: { backgroundColor: '#e7f1ff', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4 },
  collectorPillText: { color: '#3476d5', fontSize: 9, fontWeight: '800' },
  onShiftPill: { backgroundColor: '#e8fbf1', borderRadius: 9, paddingHorizontal: 9, paddingVertical: 4 },
  onShiftText: { color: '#07815f', fontSize: 9, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 9, marginTop: 12 },
  statCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 14, borderWidth: 1, flex: 1, paddingVertical: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 7 },
  statValue: { color: '#07815f', fontSize: 19, fontWeight: '800' },
  statLabel: { color: '#415348', fontSize: 10, fontWeight: '800', marginTop: 4 },
  statCaption: { color: '#9ba7a1', fontSize: 9, marginTop: 2 },
  accountCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 14, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.05, shadowRadius: 7 },
  accountHeading: { color: '#65766c', fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginBottom: 3 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  accountLabel: { color: '#9aa59f', fontSize: 10 },
  accountValue: { color: '#405147', fontSize: 10, fontWeight: '700', maxWidth: '60%', textAlign: 'right' },
  signOutButton: { alignItems: 'center', borderColor: '#ffdadd', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 7, height: 45, justifyContent: 'center', marginTop: 13 },
  signOutText: { color: '#e23d4f', fontSize: 12, fontWeight: '800' },
  syncBottomBar: { alignItems: 'center', backgroundColor: '#ffffff', borderTopColor: '#e0e8e3', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 57, paddingHorizontal: 13 },
  syncBottomTextWrap: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 6 },
  syncBottomText: { color: '#7d6a42', fontSize: 10, fontWeight: '700' },
  syncButton: { backgroundColor: '#07815f', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  syncButtonDisabled: { backgroundColor: '#8aa99a' },
  syncButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#e2e9e5', borderTopWidth: 1, flexDirection: 'row', height: 70, paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1 },
  navText: { color: '#99a7a0', fontSize: 9, fontWeight: '600', marginTop: 3 },
  navTextActive: { color: '#07815f', fontWeight: '800' },
  navIndicator: { backgroundColor: '#07815f', borderRadius: 3, height: 3, marginTop: 4, width: 4 },
  navIndicatorPlaceholder: { height: 3, marginTop: 4, width: 4 },
});
