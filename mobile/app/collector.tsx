import { PhoneNotificationControls } from '@/components/phone-notification-controls';
import { DriverRouteLayers, DriverStopLayers } from '@/components/driver-map-layers';
import { buildMapStops } from '@/lib/driver-map-presentation';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';
import { useNetworkRecovery } from '@/hooks/use-network-recovery';
import { useAppTheme } from '@/hooks/app-preferences';
import { requestJson } from '@/lib/network-request';
import { withTimeout } from '@/lib/async-timeout';
import { WorkProfileEditor } from '@/components/work-profile-editor';
import { ResidentAvatar } from '@/components/resident-avatar';
import { ProfileSettingsRow } from '@/components/profile-settings-row';
import { FinishRouteModal } from '@/components/finish-route-modal';
import { SkeletonBlock, SkeletonRegion, SkeletonRows, useSkeletonVisible } from '@/components/loading-skeleton';
import { RouteMonitoringConsentModal, useRouteMonitoringConsent } from '@/components/route-monitoring-consent-modal';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ActivityIndicator, AppState, Image, PanResponder, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { MotionPressable as Pressable, MotionModal as Modal, TabTransition, useSlidingTabPill, useClosingValue, RevealRow, useFirstLoadReveal, ToastMotion, MotionChevron } from '@/components/app-motion';
import { io } from 'socket.io-client';
import Mapbox from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import { AppText as Text } from '@/components/app-text';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { BrandMark } from '@/components/brand-mark';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { deleteOfflineRouteMap, downloadOfflineRouteMap, getOfflineRouteMapStatus, type OfflineRouteMapStatus } from '@/lib/driver-offline-map';
import { enableDriverGeofencing, getDriverGeofencingStatus, stopDriverGeofencing, updateDriverGeofences } from '@/lib/driver-geofencing';
import { getQueuedRouteLogs, getRouteLogQueueStats, subscribeToRouteLogSync, syncRouteLogQueue, type RouteLogSyncResult } from '@/lib/driver-route-log-queue';
import { isRouteCompletionQueued, queueRouteCompletion, subscribeToRouteCompletionSync, syncRouteCompletions } from '@/lib/driver-route-completion';
import { getRouteHistoryCache, saveRouteHistoryCache, mergeRouteHistory } from '@/lib/driver-route-history-cache';
import { getActiveDriverTrail, getLocalDriverTrailHistory, subscribeToDriverTrailSync, syncDriverTrailQueue } from '@/lib/driver-trail-queue';
import { claimTripStartPrompt, getRouteMonitoringPreference, setRouteMonitoringConsent, pauseRouteMonitoringToday, processDriverRouteLocation, cacheAssignedRoute, clearCachedAssignedRoute, clearRouteProximityEvents, enableRouteProximityTracking, getCachedAssignedRoute, getRouteProximityStatus, stopRouteProximityTracking, subscribeToRouteProximityStatus, type RoutePresenceStatus } from '@/lib/driver-route-proximity';
import { clearSession, getSession, type AccountUser, type AuthSession } from '@/lib/session';
import { queueCapacityLog, syncCapacityQueue, getLocalCapacityReset, type CapacityContext } from '@/lib/driver-capacity-queue';
import { countLoadedStops, truckCapacityTonnes, TONNES_PER_STOP, type CapacityStop } from '@/lib/driver-capacity';
import NetInfo from '@react-native-community/netinfo';
import { monitoringDay } from '@/lib/route-presence-filter';
import {
  clearPendingCameraContext,
  getPendingCameraContext,
  savePendingCameraContext,
} from '@/lib/camera-recovery';
import { optimizeProofPhoto, proofCameraOptions } from '@/lib/proof-photo';


type CollectorTab = 'map' | 'history' | 'profile';

type Street = {
  id: string;
  name: string;
  barangay: string | string[];
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
  assignedTruck?: { _id?: string; plateNumber?: string; truckNumber?: string; color?: string; length?: number; width?: number; height?: number } | null;
  capacityCycle?: { id: string; shiftStart: string } | null;
  isScheduledToday?: boolean;
  isCompletedToday?: boolean;
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

type CapacityLog = {
  cycleLogId?: string;
  truckId?: string;
  type?: 'reset' | 'log';
  fillLevelPct: number;
  loggedAt: string;
};

type RouteHistoryStopLog = {
  stopId: string;
  stopName?: string;
  collectedAt: string;
  exitedAt?: string;
  dwellSeconds?: number;
  flaggedForReview?: boolean;
  latitude?: number;
  longitude?: number;
};

type RouteHistoryGroup = {
  id: string;
  date: string;
  routeId: string;
  routeName: string;
  barangay: string | string[];
  totalStops: number;
  collected: number;
  flagged: number;
  avgDwellSeconds?: number;
  distanceMi: number;
  greeneryPct: number | null;
  elevationGainFt: number;
  elevationLossFt: number;
  firstEntry?: string;
  lastExit?: string;
  sessionStartedAt?: string;
  sessionEndedAt?: string;
  sessionId?: string;
  routePath?: RoutePath;
  trailPath?: RoutePath;
  lastLocation?: [number, number];
  pendingSync?: boolean;
  stopLogs: RouteHistoryStopLog[];
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
// Start the native map over Naga, before location/route camera updates arrive.
const INITIAL_MAP_CAMERA = {
  centerCoordinate: MAP_CENTER,
  zoomLevel: 12,
  animationMode: 'none' as const,
  animationDuration: 0,
};
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

function lastRouteCoordinate(feature: RouteLineFeature | null): [number, number] | null {
  if (!feature) return null;
  if (feature.geometry.type === 'LineString') {
    return feature.geometry.coordinates[feature.geometry.coordinates.length - 1] || null;
  }
  const lastLine = feature.geometry.coordinates[feature.geometry.coordinates.length - 1];
  return lastLine?.[lastLine.length - 1] || null;
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
          <Text style={styles.assignedLabel}>ROUTE HISTORY</Text>
          <View style={styles.areaNameRow}><Feather color="#58dca2" name="map-pin" size={17} /><Text numberOfLines={1} style={styles.areaName}>{route?.name || 'No active route'}</Text></View>
          <Text numberOfLines={1} style={styles.streetSubtitle}>{route?.barangay ? `${displayBarangay(route.barangay)} · ${stopNames}` : stopNames}</Text>
        </View>
        <SyncBadge hasError={hasError} isLoading={isLoading} />
      </View>
      <ShiftPills hasRoute={Boolean(route)} shift={shift} />
    </View>
  );
}

// Decorative background only; no route or sync state lives in this component.
function CollectorGradient() {
  return <>
    <LinearGradient pointerEvents="none" colors={['#24846E', '#0D2E27']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.cardGradient} />
    <View pointerEvents="none" style={styles.cardGradientShade} />
  </>;
}

function BottomNavigation({ activeTab, onChange }: { activeTab: CollectorTab; onChange: (tab: CollectorTab) => void }) {
  const insets = useSafeAreaInsets();
  const pill = useSlidingTabPill(activeTab);
  const tabs: Array<{ key: CollectorTab; label: string; icon: 'map-pin' | 'clock' | 'user' }> = [
    { key: 'map', label: 'Map', icon: 'map-pin' },
    { key: 'history', label: 'Route History', icon: 'clock' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <View style={[styles.bottomNav, { paddingBottom: Math.max(8, insets.bottom) }]}>
      {pill.indicator}
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return <Pressable motionDisabled onLayout={(event) => pill.itemLayout(tab.key, event)} accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.key} onPress={() => onChange(tab.key)} style={styles.navItem}><View onLayout={(event) => pill.iconLayout(tab.key, event)} collapsable={false} style={styles.navIconPill}><Feather color={active ? '#086B42' : '#5A6761'} name={tab.icon} size={21} /></View><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.navText, active && styles.navTextActive]}>{tab.label}</Text></Pressable>;
      })}
    </View>
  );
}

// Fit all recorded and assigned coordinates instead of zooming into the last fix.
function HistoryMapCamera({ center, zoom, group }: { center: [number, number] | null; zoom: number; group?: RouteHistoryGroup }) {
  const points = [group?.trailPath, group?.routePath].flatMap(path => {
    const feature = routeLineFeature(path);
    if (!feature) return [];
    return feature.geometry.type === 'LineString' ? feature.geometry.coordinates : feature.geometry.coordinates.flat();
  });
  const bounds = points.length ? {
    ne: [Math.max(...points.map(p => p[0])) + .0001, Math.max(...points.map(p => p[1])) + .0001],
    sw: [Math.min(...points.map(p => p[0])) - .0001, Math.min(...points.map(p => p[1])) - .0001],
    paddingTop: 28, paddingBottom: 28, paddingLeft: 28, paddingRight: 28,
  } : undefined;
  return <Mapbox.Camera defaultSettings={bounds ? { bounds } : { centerCoordinate: center ?? MAP_CENTER, zoomLevel: center ? zoom : 12 }} bounds={bounds} animationMode="none" animationDuration={0} />;
}

function StreetRow({ street, last = false }: { street: Street; last?: boolean }) {
  const collected = street.status === 'Collected';
  const statusLabel = street.flaggedForReview ? 'Collected · Review' : street.status;
  return (
    <View style={styles.streetCard}>
      <View style={styles.timelineRail}>
        {!last && <View style={[styles.timelineLine, collected && !street.flaggedForReview && styles.timelineLineCollected]} />}
        <View style={[styles.streetMarker, street.flaggedForReview ? styles.reviewMarker : collected ? styles.collectedMarker : styles.notCollectedMarker]}>
          {street.flaggedForReview ? <Feather name="flag" color="#5C3B00" size={12} /> : collected ? <Feather name="check" color="#ffffff" size={14} /> : null}
        </View>
      </View>
      <View style={styles.streetInfo}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={styles.streetName}>{street.name}</Text>
        <Text style={styles.streetBarangay}>{street.barangay}</Text>
        {street.flaggedForReview ? <Text style={styles.reviewText}>Flagged</Text> : null}
      </View>
      <View style={styles.streetStatus}>
        <Text style={[styles.streetStatusText, street.flaggedForReview ? styles.reviewText : collected ? styles.collectedText : styles.notCollectedText]}>{statusLabel}</Text>
        <Text style={styles.streetTime}>{street.time || '—'}</Text>
      </View>
    </View>
  );
}

function AccountDetail({ label, value }: { label: string; value: string }) {
  const icons: Record<string, React.ComponentProps<typeof Feather>['name']> = { 'Employee ID': 'credit-card', Contact: 'phone', Email: 'mail', Shift: 'clock', 'Assigned route': 'git-branch', 'Assigned truck': 'truck' };
  return <View style={styles.accountRow}><View style={styles.detailIconBadge}><Feather name={icons[label]} size={20} color="#0A7F4F" /></View><View style={styles.flexText}><Text style={styles.accountLabel}>{label}</Text><Text style={[styles.accountValue, value === 'Not provided' && styles.placeholderValue]}>{value}</Text></View></View>;
}

export default function CollectorScreen() {
  const appTheme = useAppTheme();
  const isDarkTheme = appTheme === 'dark';
  const networkRevision = useNetworkRecovery();
  const reducedMotion = useAppReducedMotion();
  const mapCamera = useRef<React.ElementRef<typeof Mapbox.Camera>>(null);
  const expandStopCluster = useCallback((coordinate: [number, number], zoom: number) => {
    mapCamera.current?.setCamera({ centerCoordinate: coordinate, zoomLevel: zoom, animationMode: reducedMotion ? 'none' : 'easeTo', animationDuration: reducedMotion ? 0 : 300 });
  }, [reducedMotion]);
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CollectorTab>('history');
  const [expandedStopsRouteId, setExpandedStopsRouteId] = useState<string | null>(null);
  const [showAllPastCollections, setShowAllPastCollections] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [driver, setDriver] = useState<AccountUser | null>(null);
  const [assignedRoute, setAssignedRoute] = useState<DriverRoute | null>(null);
  const [driverLocation, setDriverLocation] = useState<DriverLocation | null>(null);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [latestCapacityLog, setLatestCapacityLog] = useState<CapacityLog | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isGeofencingEnabled, setIsGeofencingEnabled] = useState(false);
  const [isUpdatingGeofence, setIsUpdatingGeofence] = useState(false);
  const [geofencingMessage, setGeofencingMessage] = useState<string | null>(null);
  const [routePresence, setRoutePresence] = useState<RoutePresenceStatus>({ enabled: false, state: 'unknown' });
  const [offlineMap, setOfflineMap] = useState<OfflineRouteMapStatus>({ completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 });
  const [isUpdatingOfflineMap, setIsUpdatingOfflineMap] = useState(false);
  const [offlineMapMessage, setOfflineMapMessage] = useState<string | null>(null);
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [pendingRouteLogs, setPendingRouteLogs] = useState(0);
  const [failedRouteLogs, setFailedRouteLogs] = useState(0);
  const [queuedRouteStopIds, setQueuedRouteStopIds] = useState<string[]>([]);
  const [queuedCapacityStops, setQueuedCapacityStops] = useState<CapacityStop[]>([]);
  const [complaints, setComplaints] = useState<ComplaintMarker[]>([]);
  const [selectedComplaint, setSelectedComplaint] = useState<ComplaintMarker | null>(null);
  const closingComplaint = useClosingValue(selectedComplaint);
  const [pendingProofAsset, setPendingProofAsset] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [isOpeningProofCamera, setIsOpeningProofCamera] = useState(false);
  const [isResolvingComplaint, setIsResolvingComplaint] = useState(false);
  const [complaintMessage, setComplaintMessage] = useState<string | null>(null);
  const [isResolutionSuccessVisible, setIsResolutionSuccessVisible] = useState(false);
  const [historyGroups, setHistoryGroups] = useState<RouteHistoryGroup[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadError, setHistoryLoadError] = useState<string | null>(null);
  const [selectedHistoryGroup, setSelectedHistoryGroup] = useState<RouteHistoryGroup | null>(null);
  const [isHistoryDetailVisible, setIsHistoryDetailVisible] = useState(false);
  const [isHistoryMapExpanded, setIsHistoryMapExpanded] = useState(false);
  const [isSubmittingRoute, setIsSubmittingRoute] = useState(false);
  const submittingRouteRef = useRef(false);
  const [isFinishRouteConfirmVisible, setIsFinishRouteConfirmVisible] = useState(false);
  const [routeActionMessage, setRouteActionMessage] = useState<{ kind: 'success' | 'error'; title: string; message: string; retryCompletion?: boolean } | null>(null);
  
  const [isEmptiedUndoing, setIsEmptiedUndoing] = useState(false);
  const [localResetTimestamp, setLocalResetTimestamp] = useState<number>(0);
  const [isSavingCapacity, setIsSavingCapacity] = useState(false);
  const capacityContext: CapacityContext | null = assignedRoute?.capacityCycle?.id && assignedRoute.assignedTruck?._id && (session?.user._id || session?.user.id)
    ? { collectorId: (session.user._id || session.user.id)!, cycleLogId: assignedRoute.capacityCycle.id, routeId: assignedRoute._id, truckId: assignedRoute.assignedTruck._id } : null;
  const capacityKey = capacityContext ? `${capacityContext.collectorId}:${capacityContext.cycleLogId}:${capacityContext.truckId}:${capacityContext.routeId}` : '';
  const capacityKeyRef = useRef(capacityKey);
  capacityKeyRef.current = capacityKey;
  const emptyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTogglingMonitoringRef = useRef(false);
  const monitoringSuspendedRef = useRef(false);
  const finishRouteFlowRef = useRef(false);
  finishRouteFlowRef.current = isFinishRouteConfirmVisible || isSubmittingRoute;
  const driverDataRequestRef = useRef(0);
  const monitoringRequestRef = useRef(0);
  const autoMonitoringAttemptsRef = useRef(new Set<string>());
  const historyLoadRequestRef = useRef(0);
  const [autoMonitoringRevision, setAutoMonitoringRevision] = useState(0);
  
  const handleTruckEmptied = () => {
    if (!capacityContext || emptyTimeoutRef.current || isSavingCapacity || truckCapacityTonnes(assignedRoute?.assignedTruck) <= 0) return;
    const context = capacityContext;
    const key = capacityKey;
    const now = Date.now();
    setIsEmptiedUndoing(true);
    emptyTimeoutRef.current = setTimeout(async () => {
      if (capacityKeyRef.current !== key) return;
      setIsEmptiedUndoing(false);
      setIsSavingCapacity(true);
      try {
        await queueCapacityLog({ ...context, clientId: `reset-${context.collectorId}-${now}`, type: 'reset', fillLevelPct: 0, loggedAt: new Date(now).toISOString() });
        if (capacityKeyRef.current === key) setLocalResetTimestamp(now);
        if (session?.token) void syncCapacityQueue(session.token, context.collectorId).catch(() => {});
      } catch {
        if (capacityKeyRef.current === key) setRouteActionMessage({ kind: 'error', title: 'Could not save truck reset', message: 'The truck load was not reset. Please try Truck emptied again.' });
      } finally {
        if (capacityKeyRef.current === key) { emptyTimeoutRef.current = null; setIsSavingCapacity(false); }
      }
    }, 10000);
  };
  
  const cancelTruckEmptied = () => {
    if (emptyTimeoutRef.current) clearTimeout(emptyTimeoutRef.current);
    emptyTimeoutRef.current = null;
    setIsEmptiedUndoing(false);
  };
  const capacityPositionRef = useRef({ x: 0, y: 0 });
  const capacityDragStartRef = useRef({ x: 0, y: 0 });
  const [capacityPosition, setCapacityPosition] = useState({ x: 0, y: 0 });
  const capacityPanResponder = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) > 2 || Math.abs(gesture.dy) > 2,
    onPanResponderGrant: () => { capacityDragStartRef.current = capacityPositionRef.current; },
    onPanResponderMove: (_, gesture) => {
      const nextPosition = {
        x: capacityDragStartRef.current.x + gesture.dx,
        y: capacityDragStartRef.current.y + gesture.dy,
      };
      capacityPositionRef.current = nextPosition;
      setCapacityPosition(nextPosition);
    },
  }), []);
  const collectorId = session?.user._id || session?.user.id;
  useEffect(() => {
    let cancelled = false;
    capacityKeyRef.current = capacityKey;
    setLocalResetTimestamp(0);
    setIsEmptiedUndoing(false);
    setIsSavingCapacity(false);
    if (capacityKey) {
      const [owner, cycleLogId, truckId, routeId] = capacityKey.split(':');
      void getLocalCapacityReset({ collectorId: owner, cycleLogId, truckId, routeId }).then(value => {
        if (!cancelled) setLocalResetTimestamp(current => Math.max(current, value));
      }).catch(() => {});
    }
    return () => {
      cancelled = true;
      capacityKeyRef.current = '';
      if (emptyTimeoutRef.current) clearTimeout(emptyTimeoutRef.current);
      emptyTimeoutRef.current = null;
    };
  }, [capacityKey]);

  useEffect(() => {
    if (!session?.token || !collectorId) return;
    const retry = () => { void syncCapacityQueue(session.token, collectorId).catch(() => {}); };
    retry();
    const interval = setInterval(retry, 30000);
    return () => clearInterval(interval);
  }, [collectorId, session?.token, networkRevision]);
  const monitoringContextRef = useRef({ collectorId, routeId: assignedRoute?._id, eligible: false });
  const scheduledWeekday = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCDay();
  // A trip records travel; collection-day/completion flags only control auto prompts.
  const monitoringEligible = Boolean(session?.token && assignedRoute?._id && !isSubmittingRoute);
  const automaticTripPromptEligible = Boolean(monitoringEligible && assignedRoute
    && assignedRoute.isScheduledToday !== false && !assignedRoute.isCompletedToday
    && assignedRoute.schedule?.includes(scheduledWeekday));
  monitoringContextRef.current = { collectorId, routeId: assignedRoute?._id, eligible: monitoringEligible };
  const { visible: isMonitoringConsentVisible, requestConsent: requestMonitoringConsent, respond: respondToMonitoringConsent } = useRouteMonitoringConsent(`${collectorId ?? ''}:${assignedRoute?._id ?? ''}:${monitoringEligible}`);
  const refreshQueuedRouteStops = useCallback(async () => {
    if (!collectorId) return;
    try {
      const [logs, queueStats] = await Promise.all([
        getQueuedRouteLogs(collectorId),
        getRouteLogQueueStats(collectorId),
      ]);
      const dayStart = Date.parse(`${monitoringDay()}T00:00:00+08:00`);
      setQueuedRouteStopIds([...new Set(logs.filter(log => Date.parse(log.collectedAt) >= dayStart).map(log => log.stopId))]);
      setQueuedCapacityStops(logs);
      setPendingRouteLogs(queueStats.pending);
      setFailedRouteLogs(queueStats.failed);
    } catch {
      // The route-progress bar keeps the last known local queue state if SQLite is unavailable.
    }
  }, [collectorId]);

  useEffect(() => {
    let cancelled = false;

    const restorePendingProofPhoto = async () => {
      try {
        const savedContext = await getPendingCameraContext();
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (cancelled) return;

        if (!pendingResult || 'code' in pendingResult || pendingResult.canceled) {
          if (pendingResult && 'canceled' in pendingResult && pendingResult.canceled) {
            await clearPendingCameraContext();
          }
          return;
        }

        const pendingAsset = pendingResult.assets?.[0];
        if (!isUsableProofAsset(pendingAsset)) {
          await clearPendingCameraContext();
          return;
        }
        const recoveredAsset = await optimizeProofPhoto(pendingAsset);
        if (cancelled) return;

        setPendingProofAsset(recoveredAsset);
        setComplaintMessage('Proof photo recovered after returning from the camera.');
        await clearPendingCameraContext();

        if (savedContext?.type === 'collector' && savedContext.complaintId) {
          setSelectedComplaint((current) => current || complaints.find((c) => c._id === savedContext.complaintId) || null);
        }
    } catch {
      await clearPendingCameraContext();
      // The camera result is optional until the driver taps resolve again.
    }
    };

    void restorePendingProofPhoto();
    return () => { cancelled = true; };
  }, [collectorId, complaints]);

  // Pre-warm camera permission so the OS dialog never interrupts the camera launch.
  useEffect(() => {
    void ImagePicker.getCameraPermissionsAsync().then((status) => {
      if (status.status === 'undetermined') {
        void ImagePicker.requestCameraPermissionsAsync();
      }
    });
  }, []);

  // Monitor network connection state for offline mode
  useEffect(() => {
    let cancelled = false;
    const updateNetStatus = (state: { isConnected: boolean | null; isInternetReachable: boolean | null }) => {
      const connected = Boolean(state.isConnected && state.isInternetReachable !== false);
      if (!cancelled) setIsOffline(!connected);
    };

    const unsubscribe = NetInfo.addEventListener(updateNetStatus);
    void NetInfo.fetch().then(updateNetStatus);

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const loadDriverData = useCallback(async (token: string, cachedCollectorId?: string) => {
    if (finishRouteFlowRef.current) return;
    const requestId = ++driverDataRequestRef.current;
    const stale = () => requestId !== driverDataRequestRef.current || finishRouteFlowRef.current;
    if (!API_URL) {
      setLoadError('EXPO_PUBLIC_API_URL is not configured.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setLoadError(null);

    try {
      const network = await NetInfo.fetch();
      if (network.isConnected === false || network.isInternetReachable === false) throw new Error('Offline');
      const request = (path: string) => requestJson(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }, 10000);

      const [profileResult, routeResult, progressResult, capacityResult] = await Promise.all([
        request('/auth/me'),
        request('/collector/route'),
        request('/collector/route/progress'),
        request('/collector/capacity/latest'),
      ]);
      if (stale()) return;
      const profilePayload = profileResult.payload as ApiResponse<AccountUser>;
      const routePayload = routeResult.payload as ApiResponse<DriverRoute>;
      const progressPayload = progressResult.payload as ApiResponse<RouteProgress>;
      const capacityPayload = capacityResult.payload as ApiResponse<CapacityLog | null>;
      const errors: string[] = [];

      if (profileResult.response.ok && profilePayload.success && profilePayload.data) {
        setDriver(profilePayload.data);
      } else {
        errors.push(profilePayload.error || 'Unable to load your driver profile.');
      }

      if (capacityResult.response.ok && capacityPayload.success) {
        setLatestCapacityLog(capacityPayload.data || null);
      }

      if (routeResult.response.status === 404) {
        setAssignedRoute(null);
        setProgress(null);
        await clearCachedAssignedRoute(cachedCollectorId);
      } else if (routeResult.response.ok && routePayload.success && routePayload.data) {
        const completionPending = cachedCollectorId && await isRouteCompletionQueued(routePayload.data._id, cachedCollectorId);
        if (stale()) return;
        if (completionPending) {
          setAssignedRoute(null);
          setProgress(null);
          setIsOffline(false);
          return;
        }
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
      setIsOffline(false);
    } catch {
      if (stale()) return;
      setIsOffline(true);
      let cachedRoute: DriverRoute | null = null;
      try {
        cachedRoute = cachedCollectorId ? await getCachedAssignedRoute<DriverRoute>(cachedCollectorId) : null;
      } catch {
        // Keep the network error below if the local cache cannot be opened.
      }
      if (cachedRoute) {
        const isCompleted = cachedCollectorId ? await isRouteCompletionQueued(cachedRoute._id, cachedCollectorId) : false;
        if (stale()) return;
        if (isCompleted) {
          setAssignedRoute(null);
          setProgress(null);
          setLoadError(null);
        } else {
          setAssignedRoute(cachedRoute);
          setProgress(null);
          setLoadError(null);
        }
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
      const { response, payload } = await requestJson(`${API_URL}/collector/complaints`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
  }, [assignedRoute?._id, loadComplaints, session?.token, networkRevision]);

  useEffect(() => {
    if (!session?.token || !assignedRoute || !SOCKET_URL) return undefined;

    const socket = io(SOCKET_URL, { auth: { token: session.token } });
    const refreshComplaints = () => { void loadComplaints(session.token); };
    socket.on('complaint:status-updated', refreshComplaints);

    return () => {
      socket.off('complaint:status-updated', refreshComplaints);
      socket.disconnect();
    };
  }, [assignedRoute?._id, loadComplaints, session?.token, networkRevision]);

  useEffect(() => {
    let isMounted = true;
    getSession().then((savedSession) => {
      if (!savedSession) {
        router.replace('/login');
        return;
      }
      if (isMounted) {
        setSession(savedSession);
      }
    }).catch(() => router.replace('/login'));
    return () => { isMounted = false; };
  }, [loadDriverData, router]);

  useEffect(() => {
    if (!session?.token) return undefined;
    void loadDriverData(session.token, session.user._id || session.user.id);
  }, [loadDriverData, session?.token, networkRevision]);

  useEffect(() => {
    if (!assignedRoute || activeTab !== 'map' || Platform.OS === 'web') {
      setDriverLocation(null);
      return undefined;
    }

    let isMounted = true;
    let isStarting = false;
    let watcher: Location.LocationSubscription | null = null;
    let lastCoords: { latitude: number; longitude: number } | null = null;

    const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371000;
      const dLat = (lat2 - lat1) * (Math.PI / 180);
      const dLon = (lon2 - lon1) * (Math.PI / 180);
      const a = Math.sin(dLat / 2) ** 2
        + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) ** 2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    };

    const updateLocation = (location: Location.LocationObject) => {
      const accuracy = location.coords.accuracy ?? 999;
      if (accuracy > 30) return;

      const { latitude, longitude } = location.coords;
      if (!isMounted) return;
      void processDriverRouteLocation(location, { collectorId, routeId: assignedRoute._id });
      if (lastCoords) {
        const moved = getDistance(lastCoords.latitude, lastCoords.longitude, latitude, longitude);
        if (moved < 3) return;
      }
      lastCoords = { latitude, longitude };

      if (!isMounted) return;
      setDriverLocation({
        latitude,
        longitude,
        accuracy,
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

        // The location dot is independent of recording. The shared detector saves
        // valid trail points whenever the driver has explicitly started the trip.
        const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        updateLocation(current);

        if (!isMounted || AppState.currentState !== 'active') return;
        const nextWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 5_000 },
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
  }, [activeTab, assignedRoute?._id, assignedRoute?.name, collectorId]);

  const profile = driver || session?.user || null;
  const routeSkeleton = useSkeletonVisible(isLoading, Boolean(assignedRoute), loadError, collectorId);
  const profileSkeleton = useSkeletonVisible(isLoading, Boolean(profile), loadError, collectorId);
  const historySkeleton = useSkeletonVisible(historyLoading, historyGroups.length > 0, historyLoadError, collectorId);
  const revealStops = useFirstLoadReveal(isLoading, Boolean(assignedRoute), routeSkeleton.pending, collectorId);
  const revealHistory = useFirstLoadReveal(historyLoading, historyGroups.length > 0, historySkeleton.pending, collectorId);
  const collectorName = profile?.name?.trim() || 'Driver';
  const routeStops = assignedRoute?.stops || [];
  const mapStops = useMemo(() => routeStops
    .map((stop) => ({ ...stop, latitude: Number(stop.latitude), longitude: Number(stop.longitude) }))
    .filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude) && Math.abs(stop.latitude) <= 90 && Math.abs(stop.longitude) <= 180), [routeStops]);
  const mapRouteLine = useMemo(() => routeLineFeature(assignedRoute?.routePath), [assignedRoute?.routePath]);
  const completedStopIds = useMemo(() => new Set((progress?.logs || []).filter((log) => log.status === 'collected').map((log) => log.stopId)), [progress]);
  const geofenceStops = useMemo(() => mapStops
    .filter((stop) => !(progress?.logs || []).some((log) => log.stopId === stop._id && log.status === 'collected'))
    .map((stop) => ({ id: stop._id, latitude: stop.latitude, longitude: stop.longitude })), [mapStops, progress]);
  const mapStopFeatures = useMemo(() => buildMapStops(routeStops, progress?.logs || []), [routeStops, progress?.logs]);
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
  // Presentation only: progress, tracking and completion still use the full route.
  const showAllStops = Boolean(assignedRoute && expandedStopsRouteId === assignedRoute._id);
  const visibleTodayStreets = showAllStops ? todayStreets : todayStreets.slice(0, 5);
  const visibleHistoryGroups = showAllPastCollections ? historyGroups : historyGroups.slice(0, 3);
  const completed = progress?.completed ?? completedStopIds.size;
  const totalStops = progress?.totalStops ?? routeStops.length;
  const pending = Math.max(0, progress?.remaining ?? totalStops - completedStopIds.size);
  const reviewCount = (progress?.logs || []).filter((log) => log.flaggedForReview).length;
  const capacityCompletedStops = useMemo(
    () => new Set([...completedStopIds, ...queuedRouteStopIds].filter(id => routeStops.some(stop => stop._id === id))).size,
    [completedStopIds, queuedRouteStopIds, routeStops],
  );
  const routeProgressPct = totalStops
    ? Math.round(Math.min(100, Math.max(0, (capacityCompletedStops / totalStops) * 100)))
    : 0;

  const serverResetTime = latestCapacityLog?.cycleLogId === capacityContext?.cycleLogId && latestCapacityLog?.truckId === capacityContext?.truckId
    ? Date.parse(latestCapacityLog?.loggedAt || '') || 0 : 0;
  const latestResetTime = Math.max(localResetTimestamp, serverResetTime);
  const capacityDayStart = Date.parse(`${monitoringDay()}T00:00:00+08:00`);
  
  const stopsSinceReset = useMemo(() => {
    return countLoadedStops([...(progress?.logs || []), ...queuedCapacityStops], routeStops.map(stop => stop._id), latestResetTime,
      Math.max(capacityDayStart, Date.parse(assignedRoute?.capacityCycle?.shiftStart || '') || 0));
  }, [progress, queuedCapacityStops, routeStops, latestResetTime, capacityDayStart, assignedRoute?.capacityCycle?.shiftStart]);
  
  const capacityTonnes = truckCapacityTonnes(assignedRoute?.assignedTruck);
  
  const estimatedTonnes = stopsSinceReset * TONNES_PER_STOP;
  const cylinderPct = capacityTonnes > 0 ? Math.min(100, Math.max(0, (estimatedTonnes / capacityTonnes) * 100)) : 0;
  
  const remainingStops = Math.max(0, totalStops - capacityCompletedStops);
  const projectedPct = capacityTonnes > 0 ? ((estimatedTonnes + (remainingStops * TONNES_PER_STOP)) / capacityTonnes) * 100 : 0;
  
  const capacityStatus = projectedPct > 100 || cylinderPct >= 90 ? 'CRITICAL' : projectedPct >= 90 ? 'WARNING' : 'OK';
  const firstMapStop = mapStops[0];
  const firstRoutePoint = firstRouteCoordinate(mapRouteLine);
  const hasMapFocus = Boolean(firstMapStop || firstRoutePoint);
  const mapCenter: [number, number] = firstMapStop ? [firstMapStop.longitude, firstMapStop.latitude] : firstRoutePoint || MAP_CENTER;
  const cameraCenter: [number, number] = driverLocation ? [driverLocation.longitude, driverLocation.latitude] : mapCenter;
  const barangay = displayBarangay(assignedRoute?.barangay) || profile?.barangay || profile?.location || 'No route assigned';
  const historyGroupLastLocation = useCallback((group: RouteHistoryGroup): [number, number] | null => {
    const trailLastLocation = lastRouteCoordinate(routeLineFeature(group.trailPath));
    if (trailLastLocation) return trailLastLocation;
    if (group.lastLocation) return group.lastLocation;
    const routeLastLocation = lastRouteCoordinate(routeLineFeature(group.routePath));
    if (routeLastLocation) return routeLastLocation;
    if (group.stopLogs?.length) {
      const last = [...group.stopLogs].reverse().find((log) => Number.isFinite(Number(log.latitude)) && Number.isFinite(Number(log.longitude)));
      if (last && last.longitude != null && last.latitude != null) return [Number(last.longitude), Number(last.latitude)];
    }
    return null;
  }, []);


  const [liveTrail, setLiveTrail] = useState<Awaited<ReturnType<typeof getActiveDriverTrail>> | null>(null);
  useEffect(() => {
    let cancelled = false;
    let reading = false;
    setLiveTrail(null);
    const refresh = async () => {
      if (reading || !collectorId || !assignedRoute?._id || AppState.currentState !== 'active') return;
      reading = true;
      try {
        const trail = await getActiveDriverTrail(collectorId, assignedRoute._id);
        if (!cancelled) setLiveTrail(trail);
      } catch { /* Keep the last saved preview if a database read is busy. */ }
      finally { reading = false; }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    return () => { cancelled = true; clearInterval(timer); subscription.remove(); };
  }, [collectorId, assignedRoute?._id]);

  const submitRoute = async () => {
    if (!session?.token || !assignedRoute || isSubmittingRoute) return;
    finishRouteFlowRef.current = true;
    driverDataRequestRef.current += 1;
    setIsLoading(false);
    setIsFinishRouteConfirmVisible(true);
  };

  const confirmRouteCompletion = async () => {
    if (!session?.token || !assignedRoute || isSubmittingRoute || submittingRouteRef.current) return;
    submittingRouteRef.current = true;
    const routeId = assignedRoute._id;
    const token = session.token;
    const effectiveCollectorId = collectorId || session.user._id || session.user.id || '';
    setIsSubmittingRoute(true);
    setRouteActionMessage(null);

    const completeOffline = async () => {
      await queueRouteCompletion(routeId, effectiveCollectorId);

      try {
        const localHistoryGroup: RouteHistoryGroup = {
          id: `${monitoringDay()}|${routeId}`,
          date: monitoringDay(),
          routePath: assignedRoute.routePath,
          pendingSync: true,
          routeId,
          routeName: assignedRoute.name,
          barangay: displayBarangay(assignedRoute.barangay),
          totalStops,
          collected: completed,
          flagged: 0,
          distanceMi: 0,
          greeneryPct: null,
          elevationGainFt: 0,
          elevationLossFt: 0,
          sessionStartedAt: new Date().toISOString(),
          sessionEndedAt: new Date().toISOString(),
          stopLogs: [],
        };
        const cachedHistory = effectiveCollectorId ? await getRouteHistoryCache<RouteHistoryGroup>(effectiveCollectorId).catch(() => []) : [];
        const localTrails = effectiveCollectorId ? await getLocalDriverTrailHistory(effectiveCollectorId) : [];
        const nextHistory = mergeRouteHistory<RouteHistoryGroup>([localHistoryGroup], mergeRouteHistory<RouteHistoryGroup>(cachedHistory, localTrails));
        setHistoryGroups(nextHistory);
        if (effectiveCollectorId) {
          await saveRouteHistoryCache(effectiveCollectorId, nextHistory).catch(() => {});
        }
      } catch (histErr) {
        console.warn('Could not update offline route history cache:', histErr);
      }

      setAssignedRoute(null);
      void clearCachedAssignedRoute(effectiveCollectorId);
      void clearRouteProximityEvents(routeId);
      setRouteActionMessage({
        kind: 'success',
        title: 'Route saved',
        message: 'Your route and recorded trail are saved on this phone. Pending uploads will sync when a connection is available.',
      });
    };

    try {
      await disableBackgroundGeofencing();
      await completeOffline();
      if (API_URL && effectiveCollectorId) {
        void syncDriverTrailQueue({ apiUrl: API_URL, token, collectorId: effectiveCollectorId }).catch(() => {});
        void syncRouteCompletions(API_URL, token, effectiveCollectorId)
          .then(synced => { if (synced) void loadRouteHistory(token); }).catch(() => {});
      }
    } catch (err) {
      const isNetworkErr = !API_URL || (err instanceof Error && (
        err.message.includes('Network request failed') ||
        err.message.includes('network') ||
        err.message.includes('fetch') ||
        err.message.includes('timeout') ||
        err.message.includes('timed out') ||
        err.message.includes('Failed to fetch')
      ));

      if (isNetworkErr) {
        try { await completeOffline(); }
        catch (saveError) { setRouteActionMessage({ kind: 'error', title: 'Could not save route', message: saveError instanceof Error ? saveError.message : 'Please try saving again.', retryCompletion: true }); }
      } else {
        setRouteActionMessage({
          kind: 'error',
          title: 'Could not finish route',
          message: err instanceof Error ? err.message : 'The route could not be completed. Please try again.',
          retryCompletion: true,
        });
      }
    } finally {
      submittingRouteRef.current = false;
      setIsFinishRouteConfirmVisible(false);
      setIsSubmittingRoute(false);
    }
  };

  const loadRouteHistory = useCallback(async (token: string) => {
    if (!collectorId) return;
    const requestId = ++historyLoadRequestRef.current;
    setHistoryLoading(true);
    setHistoryLoadError(null);
    const controller = new AbortController();
    let groups: RouteHistoryGroup[] = [];
    const showHistory = (next: RouteHistoryGroup[]) => {
      if (requestId !== historyLoadRequestRef.current) return;
      setHistoryGroups(next);
      setSelectedHistoryGroup(current => current ? next.find(group => group.routeId === current.routeId && group.date === current.date) || current : current);
    };
    try {
      const [cached, local] = await Promise.all([getRouteHistoryCache<RouteHistoryGroup>(collectorId), getLocalDriverTrailHistory(collectorId)]);
      groups = mergeRouteHistory<RouteHistoryGroup>(cached.map(group => ({...group, pendingSync: false})), local);
      showHistory(groups);
      const network = await withTimeout(NetInfo.fetch());
      if (!API_URL || network.isConnected === false || network.isInternetReachable === false) throw new Error('Offline');
      const response = await withTimeout(fetch(`${API_URL}/collector/route-history?grouped=true`, {
        signal: controller.signal, headers: { Authorization: `Bearer ${token}` },
      }));
      const payload = await withTimeout(response.json()) as ApiResponse<{ groups?: RouteHistoryGroup[] }>;
      if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load collection history.');
      groups = mergeRouteHistory<RouteHistoryGroup>(Array.isArray(payload.data?.groups) ? payload.data.groups : [], groups);
      showHistory(groups);
      if (requestId !== historyLoadRequestRef.current) return;
      await saveRouteHistoryCache(collectorId, groups);
      setHistoryLoadError(groups.length ? null : 'No past collections yet. After finishing your first collection, it will appear here.');
    } catch {
      if (requestId !== historyLoadRequestRef.current) return;
      showHistory(groups);
      setHistoryLoadError(groups.length ? 'Showing trips saved on this phone. Pending records sync when online.' : 'No saved collection history is available on this phone yet.');
    } finally {
      controller.abort();
      if (requestId === historyLoadRequestRef.current) setHistoryLoading(false);
    }
  }, [collectorId]);

  useEffect(() => {
    if (!API_URL || !session?.token || !collectorId) return undefined;
    return subscribeToRouteCompletionSync(API_URL, session.token, collectorId, () => {
      void loadDriverData(session.token, collectorId);
      void loadRouteHistory(session.token);
    });
  }, [collectorId, loadDriverData, loadRouteHistory, session?.token]);

  const openHistoryDetail = useCallback((group: RouteHistoryGroup) => {
    setSelectedHistoryGroup(group);
    setIsHistoryDetailVisible(true);
  }, []);

  useEffect(() => {
    if (!session?.token) {
      setHistoryGroups([]);
      setHistoryLoadError(null);
      return undefined;
    }
    void loadRouteHistory(session.token);
    const interval = setInterval(() => { void loadRouteHistory(session.token); }, 60_000);
    return () => clearInterval(interval);
  }, [loadRouteHistory, session?.token, networkRevision]);

  const refreshRoutePresence = useCallback(async () => {
    if (!assignedRoute) {
      setRoutePresence({ enabled: false, state: 'unknown' });
      setOfflineMap({ completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 });
      return;
    }

    try {
      const routeId = assignedRoute._id;
      const current = () => monitoringContextRef.current.routeId === routeId;
      await Promise.allSettled([
        withTimeout(getRouteProximityStatus()).then(status => { if (current()) setRoutePresence(status.routeId === routeId ? status : { enabled: false, state: 'unknown' }); }),
        withTimeout(getOfflineRouteMapStatus(routeId)).then(mapStatus => { if (current()) setOfflineMap(mapStatus); }),
      ]);
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
    });
    const refreshInterval = setInterval(() => { void refreshRoutePresence(); }, 20_000);

    return () => {
      unsubscribe();
      clearInterval(refreshInterval);
    };
  }, [assignedRoute?._id, refreshRoutePresence]);

  useEffect(() => {
    // Route geometry changes use the same consent-aware setup path as auto-arm.
    setAutoMonitoringRevision(value => value + 1);
  }, [assignedRoute?._id, assignedRoute?.name, assignedRoute?.routePath, collectorId]);

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
      void refreshQueuedRouteStops();
      if (result.synced) void loadDriverData(session.token, collectorId);
    };

    const unsubscribe = subscribeToRouteLogSync(context, handleSync);
    void getRouteLogQueueStats(collectorId).then((stats) => {
      if (isMounted) {
        setPendingRouteLogs(stats.pending);
        setFailedRouteLogs(stats.failed);
      }
    });
    void refreshQueuedRouteStops();
    const queuePoll = setInterval(() => { void refreshQueuedRouteStops(); }, 3000);

    return () => {
      isMounted = false;
      unsubscribe();
      clearInterval(queuePoll);
    };
  }, [applyQueueResult, collectorId, loadDriverData, refreshQueuedRouteStops, session?.token]);

  useEffect(() => {
    if (!API_URL || !session?.token || !collectorId) return undefined;

    const context = { apiUrl: API_URL, token: session.token, collectorId };
    const unsubscribe = subscribeToDriverTrailSync(context, result => { if (result.syncedSessions) void loadRouteHistory(session.token); });
    const syncInterval = setInterval(() => {
      void syncDriverTrailQueue(context).then(result => { if (result.syncedSessions) void loadRouteHistory(session.token); }).catch(() => {});
    }, 30_000);

    return () => {
      unsubscribe();
      clearInterval(syncInterval);
    };
  }, [collectorId, loadRouteHistory, session?.token]);

  useEffect(() => {
    let isMounted = true;

    const syncGeofences = async () => {
      if (isLoading || !session || !API_URL || finishRouteFlowRef.current) return;

      try {
        const enabled = await getDriverGeofencingStatus();
        if (!isMounted || finishRouteFlowRef.current) return;
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
  }, [geofenceStops, isLoading, loadError, session, isFinishRouteConfirmVisible, isSubmittingRoute]);

  const enableBackgroundGeofencing = useCallback(async ({ automatic = false }: { automatic?: boolean } = {}) => {
    if (finishRouteFlowRef.current) return;
    if (isTogglingMonitoringRef.current || monitoringSuspendedRef.current) return;
    if (!collectorId || !assignedRoute?._id || !monitoringEligible) {
      setGeofencingMessage('An assigned route is needed to start a trip. Refresh your assignment and try again.');
      return;
    }
    const requestId = ++monitoringRequestRef.current;
    const contextIsCurrent = () => requestId === monitoringRequestRef.current && !monitoringSuspendedRef.current
      && monitoringContextRef.current.collectorId === collectorId
      && monitoringContextRef.current.routeId === assignedRoute._id
      && monitoringContextRef.current.eligible;
    isTogglingMonitoringRef.current = true;
    if (!automatic) setIsUpdatingGeofence(true);
    setGeofencingMessage(null);
    try {
      const preference = await getRouteMonitoringPreference(collectorId);
      if (!contextIsCurrent() || finishRouteFlowRef.current) return;
      let newlyConsented = false;
      const currentTracking = await getRouteProximityStatus();
      if (finishRouteFlowRef.current) return;
      const sameActiveTrip = currentTracking.enabled && currentTracking.routeId === assignedRoute._id;
      // A saved configuration belongs to an unfinished trip. It survives an
      // app/process close and may be restarted from the cached assignment while
      // offline, without asking the driver for consent again.
      const sameSavedTrip = preference.consent === true
        && preference.pausedDay !== monitoringDay()
        && currentTracking.routeId === assignedRoute._id;
      if (automatic && !sameActiveTrip) {
        if (!sameSavedTrip) {
          if (!automaticTripPromptEligible || activeTab !== 'map' || editingProfile || preference.pausedDay === monitoringDay()) return;
          if (!await claimTripStartPrompt(collectorId, assignedRoute._id)) return;
        }
        if (!contextIsCurrent() || finishRouteFlowRef.current) return;
      }
      if ((!automatic || !sameActiveTrip) && !(automatic && sameSavedTrip)) {
        if (!automatic) await claimTripStartPrompt(collectorId, assignedRoute._id);
        if (finishRouteFlowRef.current) return;
        const accepted = await requestMonitoringConsent();
        if (!contextIsCurrent()) return;
        await setRouteMonitoringConsent(collectorId, accepted);
        if (!accepted) {
          await Promise.all([stopRouteProximityTracking({ forgetConfiguration: true }), stopDriverGeofencing({ forgetConfiguration: true })]);
          setRoutePresence({ enabled: false, state: 'unknown' });
          setGeofencingMessage('Trip has not started. Tap Start trip when you are ready.');
          return;
        }
        newlyConsented = true;
        setIsUpdatingGeofence(true);
      }
      if (!contextIsCurrent() || finishRouteFlowRef.current || AppState.currentState !== 'active') return;
      // An explicit Start trip resumes today's paused detector. Automatic checks
      // never clear the driver's pause or keep asking for revoked permissions.
      if (!automatic) await setRouteMonitoringConsent(collectorId, true);
      if (!contextIsCurrent()) return;
      const routeResult = await enableRouteProximityTracking({
        collectorId, routeId: assignedRoute._id, routeName: assignedRoute.name, routePath: assignedRoute.routePath ?? null,
        routeSnapshot: { name: assignedRoute.name, barangay: Array.isArray(assignedRoute.barangay) ? assignedRoute.barangay : [assignedRoute.barangay], routePath: assignedRoute.routePath, stops: assignedRoute.stops },
      }, { requestPermissions: !automatic || newlyConsented });
      if (!contextIsCurrent()) {
        await stopRouteProximityTracking({ forgetConfiguration: true });
        return;
      }
      // GPS startup is complete. Optional stop zones/map-pack reads must not lock End trip.
      setRoutePresence(previous => ({...previous, enabled: routeResult.enabled}));
      setIsUpdatingGeofence(false);
      if (finishRouteFlowRef.current) return;
      if (routeResult.enabled && API_URL && geofenceStops.length) {
        const stopResult = await enableDriverGeofencing({ apiUrl: API_URL, stops: geofenceStops });
        setIsGeofencingEnabled(stopResult.enabled);
        setGeofencingMessage(stopResult.enabled ? null : `Route detection is on. Stop zones: ${stopResult.message}`);
      } else {
        await withTimeout(stopDriverGeofencing({ forgetConfiguration: true }));
        setIsGeofencingEnabled(false);
        setGeofencingMessage(routeResult.enabled ? null : routeResult.message);
      }
      if (!contextIsCurrent()) {
        await Promise.all([stopDriverGeofencing({ forgetConfiguration: true }), stopRouteProximityTracking({ forgetConfiguration: true })]);
        return;
      }
      if (routeResult.enabled && session?.token && API_URL) {
        void syncRouteLogQueue({ apiUrl: API_URL, token: session.token, collectorId }).then(applyQueueResult).catch(() => {});
        void syncDriverTrailQueue({ apiUrl: API_URL, token: session.token, collectorId }).catch(() => {});
      }
      void refreshRoutePresence();
    } catch {
      if (contextIsCurrent()) setGeofencingMessage('Monitoring setup did not finish. Check the trip status and location permissions before retrying.');
      void refreshRoutePresence();
    } finally {
      if (requestId === monitoringRequestRef.current) {
        setIsUpdatingGeofence(false);
        isTogglingMonitoringRef.current = false;
      }
    }
  }, [API_URL, activeTab, automaticTripPromptEligible, editingProfile, applyQueueResult, assignedRoute, collectorId, geofenceStops, monitoringEligible, refreshRoutePresence, requestMonitoringConsent, session?.token]);

  const disableBackgroundGeofencing = useCallback(async () => {
    // Cancel pending startup even if a permission request is still open.
    monitoringRequestRef.current += 1;
    respondToMonitoringConsent(false);
    const stopRoute = stopRouteProximityTracking({ forgetConfiguration: true });
    setIsUpdatingGeofence(true);
    try {
      await withTimeout(Promise.all([stopRoute, collectorId ? pauseRouteMonitoringToday(collectorId) : Promise.resolve(), stopDriverGeofencing({ forgetConfiguration: true })]));
      setRoutePresence({ enabled: false, state: 'unknown' });
      setIsGeofencingEnabled(false);
      setGeofencingMessage('Trip ended and saved on this device. Pending records sync when online. Tap Start trip for another trip.');
      if (session?.token) void loadRouteHistory(session.token);
      if (API_URL && session?.token && collectorId) void syncDriverTrailQueue({apiUrl: API_URL, token: session.token, collectorId}).catch(() => {});
    } catch {
      setGeofencingMessage('Unable to fully stop monitoring. Check the location notification and try again.');
      void refreshRoutePresence();
      throw new Error('Trip monitoring could not be stopped. Please try again before finishing the route.');
    } finally {
      isTogglingMonitoringRef.current = false;
      setIsUpdatingGeofence(false);
    }
  }, [collectorId, loadRouteHistory, refreshRoutePresence, respondToMonitoringConsent, session?.token]);

  const endTrip = async () => {
    if (isUpdatingGeofence || isSubmittingRoute) return;
    // Opening or cancelling the dialog must leave GPS and the active trip intact.
    await submitRoute();
  };

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setAutoMonitoringRevision(value => value + 1);
    });
    const interval = setInterval(() => {
      if (AppState.currentState === 'active') setAutoMonitoringRevision(value => value + 1);
    }, 60_000);
    return () => { subscription.remove(); clearInterval(interval); };
  }, []);

  useEffect(() => {
    if (isFinishRouteConfirmVisible || isSubmittingRoute) return;
    if (Platform.OS === 'web' || isLoading || isUpdatingGeofence || !collectorId || monitoringSuspendedRef.current || AppState.currentState !== 'active') return;
    if (!monitoringEligible) {
      // An unavailable assignment or route submission must not keep the detector running.
      if (!loadError) void Promise.all([stopRouteProximityTracking({ forgetConfiguration: true }), stopDriverGeofencing({ forgetConfiguration: true })]).catch(() => {});
      return;
    }
    const attemptKey = `${collectorId}:${assignedRoute?._id}:${monitoringDay()}:${autoMonitoringRevision}:${activeTab}:${editingProfile}`;
    if (autoMonitoringAttemptsRef.current.has(attemptKey)) return;
    autoMonitoringAttemptsRef.current.clear();
    autoMonitoringAttemptsRef.current.add(attemptKey);
    void enableBackgroundGeofencing({ automatic: true });
  }, [activeTab, editingProfile, assignedRoute?._id, autoMonitoringRevision, collectorId, enableBackgroundGeofencing, isLoading, isUpdatingGeofence, loadError, monitoringEligible, isFinishRouteConfirmVisible, isSubmittingRoute]);

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
    monitoringSuspendedRef.current = true;
    monitoringRequestRef.current += 1;
    respondToMonitoringConsent(false);
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
        await savePendingCameraContext({
          type: 'collector',
          complaintId: selectedComplaint._id,
        });
        try {
          const result = await ImagePicker.launchCameraAsync(proofCameraOptions);
          if (result.canceled) {
            await clearPendingCameraContext();
            return;
          }
          const capturedAsset = result.assets?.[0];
          if (!isUsableProofAsset(capturedAsset)) {
            await clearPendingCameraContext();
            throw new Error('The camera did not return a usable photo. Please try again.');
          }
          asset = await optimizeProofPhoto(capturedAsset);
          await clearPendingCameraContext();
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

  const awaitingEntry = routePresence.enabled && !routePresence.hasEntered && routePresence.state !== 'on_route';
  const weakRouteSignal = routePresence.signal === 'poor' || routePresence.signal === 'stale';
  const monitoringTitle = !routePresence.enabled ? 'Ready to start trip'
    : weakRouteSignal ? 'Waiting for accurate GPS'
    : 'Trip in progress';
  const monitoringCaption = geofencingMessage || (!routePresence.enabled
    ? 'Start your trip to record travel, including outside the assigned route and while minimized.'
    : weakRouteSignal ? 'No entry or exit will be confirmed until fresh, accurate GPS readings return.'
    : !mapRouteLine ? 'Recording your GPS trail. Route entry detection is unavailable until the assigned route has a road line.'
    : awaitingEntry ? 'Your trip is recording. Assigned-route entry is confirmed separately after accurate GPS readings.'
    : `${Math.round(routePresence.distanceMeters || 0)} m from the route · last checked ${formatTime(routePresence.lastCheckedAt)}`);

  const mapScreen = (
    <View style={styles.mapScreen}>
      <View style={styles.mapPlaceholder}>
        {MAPBOX_ACCESS_TOKEN ? (
          <Mapbox.MapView scaleBarEnabled={false} style={styles.mapView} styleURL={isDarkTheme ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street} logoEnabled attributionEnabled logoPosition={{ top: 8, left: 8 }} attributionPosition={{ top: 8, right: 8 }}>
            <Mapbox.Camera
              ref={mapCamera}
              defaultSettings={INITIAL_MAP_CAMERA}
              centerCoordinate={cameraCenter}
              zoomLevel={driverLocation ? 15 : hasMapFocus ? 14 : 12}
              animationMode="easeTo"
              animationDuration={500}
            />
            {mapRouteLine ? <DriverRouteLayers shape={mapRouteLine} /> : null}
            {liveTrail?.path ? <Mapbox.ShapeSource id="live-recorded-trail" shape={routeLineFeature(liveTrail.path) ?? undefined}>
              <Mapbox.LineLayer id="live-recorded-trail-line" style={{ lineColor: '#c53030', lineWidth: 4, lineCap: 'round', lineJoin: 'round' }} />
            </Mapbox.ShapeSource> : null}
            {mapStopFeatures.features.length ? <DriverStopLayers shape={mapStopFeatures} onExpandCluster={expandStopCluster} /> : null}
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
        {/* Non-intrusive offline icon badge placed at the top-left corner */}
        {isOffline && (
          <View
            accessibilityLabel="Working offline"
            accessibilityRole="image"
            style={[styles.offlineMapBadge, { top: Math.max(insets.top + 16, 52) }]}
          >
            <Feather color="#c05d36" name="wifi-off" size={17} />
          </View>
        )}
        {MAPBOX_ACCESS_TOKEN && !routeSkeleton.pending && !assignedRoute && (
          <View style={styles.mapPlaceholderLabel}>
            <Feather color={loadError ? '#c05d36' : '#4d7e69'} name={loadError ? 'alert-circle' : 'map'} size={17} />
            <Text style={styles.mapPlaceholderText}>{loadError || 'No route is scheduled for today.'}</Text>
          </View>
        )}
        {MAPBOX_ACCESS_TOKEN && !routeSkeleton.pending && assignedRoute && routeStops.length === 0 && (
          <View style={styles.mapPlaceholderLabel}>
            <Feather color="#c77d10" name="map-pin" size={17} />
            <Text style={styles.mapPlaceholderText}>No stops configured for this route.</Text>
          </View>
        )}
        {assignedRoute && (
          <View style={styles.geofenceCard}>
            <View style={styles.geofenceHeader}>
              <View style={styles.geofenceStatusRow}>
                <Feather color={routePresence.enabled && routePresence.state === 'on_route' ? '#07815f' : routePresence.enabled ? '#c77d10' : '#68776e'} name={routePresence.enabled ? 'navigation' : 'map-pin'} size={17} />
                <View style={styles.geofenceTextWrap}>
                  <Text style={styles.geofenceTitle}>{monitoringTitle}</Text>
                  <Text style={styles.geofenceCaption}>{monitoringCaption}</Text>
                  {routePresence.enabled ? <Text style={styles.geofenceCaption}>{liveTrail?.lastRecordedAt
                    ? `${liveTrail.points} recent GPS fixes saved on phone · Last fix ${Math.max(0, Math.floor((Date.now() - Date.parse(liveTrail.lastRecordedAt)) / 1000))}s ago. Red line: recorded travel.`
                    : 'Waiting for the first accurate GPS fix. No trail saved yet.'}</Text> : null}
                </View>
              </View>
              <Pressable
                accessibilityLabel={routePresence.enabled ? 'End trip' : 'Start trip'}
                accessibilityRole="button"
                accessibilityState={{ disabled: isUpdatingGeofence || (!routePresence.enabled && !monitoringEligible), busy: isUpdatingGeofence }}
                disabled={isUpdatingGeofence || (!routePresence.enabled && !monitoringEligible)}
                onPress={() => void (routePresence.enabled ? endTrip() : enableBackgroundGeofencing())}
                style={[styles.tripButton, routePresence.enabled && styles.tripEndButton, (isUpdatingGeofence || (!routePresence.enabled && !monitoringEligible)) && {opacity:0.5}]}
              >
                <Text style={[styles.tripButtonText, routePresence.enabled && {color:'#086B42'}]}>{isUpdatingGeofence ? 'Please wait...' : routePresence.enabled ? 'End trip' : 'Start trip'}</Text>
              </Pressable>
            </View>
            <PhoneNotificationControls role="driver" tracking={routePresence.enabled} compact />
            {pendingRouteLogs > 0 && <Text style={styles.geofenceQueueText}>{pendingRouteLogs} route log{pendingRouteLogs === 1 ? '' : 's'} queued for sync{failedRouteLogs ? ` (${failedRouteLogs} need attention)` : ''}.</Text>}
          </View>
        )}
        {(assignedRoute || routeSkeleton.pending) && (
          <View {...capacityPanResponder.panHandlers} style={[styles.capacityFloatingCard, { transform: [{ translateX: capacityPosition.x }, { translateY: capacityPosition.y }] }]}>
            <Text numberOfLines={2} style={styles.capacityCylinderLabel}>Truck load</Text>
            <SkeletonRegion state={routeSkeleton} placeholder={<SkeletonBlock width={76} height={112} />}>
            <View style={[styles.capacityCylinder, capacityStatus === 'CRITICAL' && styles.capacityCylinderCritical, capacityStatus === 'WARNING' && styles.capacityCylinderWarning]}>
              <View style={[styles.capacityCylinderFill, { height: `${cylinderPct}%` }, capacityStatus === 'CRITICAL' && styles.capacityCylinderFillCritical, capacityStatus === 'WARNING' && styles.capacityCylinderFillWarning]} />
              <View style={[styles.capacityCylinderTop, capacityStatus === 'CRITICAL' && styles.capacityCylinderTopCritical, capacityStatus === 'WARNING' && styles.capacityCylinderTopWarning]} />
              {capacityTonnes <= 0
                ? <Text style={styles.capacityNoLoadText}>{assignedRoute?.assignedTruck ? 'Truck size unavailable.' : 'No truck assigned.'}</Text>
                : stopsSinceReset === 0
                ? <Text style={styles.capacityNoLoadText}>No stops{`\n`}collected yet.</Text>
                : <Text style={[styles.capacityCylinderPercent, capacityStatus === 'CRITICAL' && styles.capacityCylinderPercentCritical]}>{Math.round(cylinderPct)}%</Text>}
            </View>
            </SkeletonRegion>
            <View style={styles.routeProgressIndicator}>
              <Text style={styles.routeProgressLabel}>Route progress</Text>
              <SkeletonRegion state={routeSkeleton} placeholder={<SkeletonBlock height={6} radius={3} />}>
              <View style={styles.routeProgressTrack}><View style={[styles.routeProgressFill, { width: `${routeProgressPct}%` }]} /></View>
              </SkeletonRegion>
            </View>
            {isEmptiedUndoing ? (
              <Pressable onPress={cancelTruckEmptied} style={styles.capacityEmptiedUndoButton}>
                <Text style={styles.capacityEmptiedUndoText}>Undo (10s)</Text>
              </Pressable>
            ) : (
              <Pressable disabled={!capacityContext || capacityTonnes <= 0 || isSavingCapacity} accessibilityState={{ disabled: !capacityContext || capacityTonnes <= 0 || isSavingCapacity }} onPress={handleTruckEmptied} style={styles.capacityEmptiedButton}>
                <Text style={styles.capacityEmptiedButtonText}>Truck emptied</Text>
              </Pressable>
            )}
          </View>
        )}
        {complaintMessage ? (
          <ToastMotion style={styles.complaintToast}>
            <Feather color="#07815f" name="check-circle" size={15} />
            <Text style={styles.complaintToastText}>{complaintMessage}</Text>
          </ToastMotion>
        ) : null}
        <Modal animationType="slide" onRequestClose={() => setSelectedComplaint(null)} transparent visible={Boolean(selectedComplaint)}>
          <View style={styles.complaintModalBackdrop}>
            <Pressable accessibilityLabel="Close complaint" onPress={() => setSelectedComplaint(null)} style={styles.complaintModalDismissArea} />
            {closingComplaint ? (
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
                  {closingComplaint.photoUrl ? <Image accessibilityLabel="Resident complaint photo" source={{ uri: closingComplaint.photoUrl }} style={styles.complaintPhoto} /> : null}
                  <Text style={styles.complaintDescription}>{closingComplaint.description || 'Resident requested collection at this location.'}</Text>
                  <View style={styles.complaintDetailRow}><Feather color="#07815f" name="map-pin" size={16} /><View style={styles.complaintDetailText}><Text style={styles.complaintDetailLabel}>Exact request location</Text><Text style={styles.complaintDetailValue}>{Number(closingComplaint.photoMetadata?.latitude).toFixed(6)}, {Number(closingComplaint.photoMetadata?.longitude).toFixed(6)}</Text><Text style={styles.complaintDetailCaption}>{closingComplaint.barangay || 'Location captured from resident photo'}</Text></View></View>
                  <View style={styles.complaintDetailRow}><Feather color="#07815f" name="clock" size={16} /><View style={styles.complaintDetailText}><Text style={styles.complaintDetailLabel}>Submitted</Text><Text style={styles.complaintDetailValue}>{formatTime(closingComplaint.createdAt)}</Text><Text style={styles.complaintDetailCaption}>{closingComplaint.photoMetadata?.capturedAt ? `Photo captured ${formatTime(closingComplaint.photoMetadata.capturedAt)}` : 'Photo capture time unavailable'}</Text></View></View>
                  <Pressable
                    disabled={isResolvingComplaint || isOpeningProofCamera}
                    onPress={() => void resolveSelectedComplaint()}
                    style={[styles.resolveComplaintButton, (isResolvingComplaint || isOpeningProofCamera) && styles.geofenceButtonDisabled]}>
                    {isOpeningProofCamera
                      ? <ActivityIndicator color="#ffffff" size="small" />
                      : <Feather color="#ffffff" name="camera" size={17} />}
                    <Text style={styles.resolveComplaintButtonText}>
                      {isResolvingComplaint ? 'Uploading proof...' : isOpeningProofCamera ? 'Opening camera...' : 'Take proof photo & resolve'}
                    </Text>
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
      <ScrollView contentContainerStyle={styles.historyScrollContent} showsVerticalScrollIndicator={false}>
        {(assignedRoute || routeSkeleton.pending) && (
          <View style={styles.todayStopsSection}>
            <View style={styles.todayStopsHeading}>
              <View>
                <Text style={styles.dateLabel}>TODAY'S STOPS</Text>
                <Text style={styles.todayStopsTitle}>Collection checklist</Text>
              </View>
              <Text style={styles.todayStopsCount}>{completed}/{todayStreets.length}</Text>
            </View>
            <SkeletonRegion state={routeSkeleton} placeholder={<SkeletonRows kind="stop" count={6} />}>
            {todayStreets.length ? visibleTodayStreets.map((street, index) => <RevealRow key={street.id} animate={revealStops} index={index}><StreetRow street={street} last={index === visibleTodayStreets.length - 1} /></RevealRow>) : (
              <View style={styles.emptyCard}>
                <Feather color="#7d8c84" name="map-pin" size={18} />
                <Text style={styles.emptyStateText}>No stops have been configured for this route yet.</Text>
              </View>
            )}
            </SkeletonRegion>
            {assignedRoute && todayStreets.length > 5 && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={showAllStops ? 'Show fewer stops' : `View all ${todayStreets.length} stops`}
                accessibilityState={{ expanded: showAllStops }}
                testID="collector-stops-toggle"
                onPress={() => setExpandedStopsRouteId(showAllStops ? null : assignedRoute._id)}
                style={styles.stopsToggle}
              >
                <Text style={styles.stopsToggleText}>{showAllStops ? 'Show fewer' : `View all ${todayStreets.length} stops`}</Text>
                <MotionChevron expanded={showAllStops}><Feather name="chevron-down" color="#086B42" size={20} /></MotionChevron>
              </Pressable>
            )}
          </View>
        )}
        <View style={styles.historyGroup}>
          <Text style={styles.sectionHeading}>PAST COLLECTIONS</Text>
          {historyLoading && historyGroups.length > 0 ? <ActivityIndicator accessibilityLabel="Loading" color="#0A7F4F" /> : null}
          <SkeletonRegion state={historySkeleton} placeholder={<SkeletonRows kind="history" count={3} />}>
          {historyGroups.length ? visibleHistoryGroups.map((group, index) => (
            <RevealRow key={group.id} animate={revealHistory} index={index}>
            <Pressable accessibilityRole="button" key={group.id} onPress={() => openHistoryDetail(group)} style={styles.historyCardWrap}>
              <View style={styles.historyCard}>
                <View style={styles.historyCardMap}>
                  {MAPBOX_ACCESS_TOKEN ? (
                    <Mapbox.MapView key={group.id} scaleBarEnabled={false} styleURL={isDarkTheme ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street} style={styles.historyMapPreview} logoEnabled attributionEnabled logoPosition={{ bottom: 4, left: 4 }} attributionPosition={{ top: 4, right: 4 }} scrollEnabled={false} pitchEnabled={false} rotateEnabled={false} zoomEnabled={false}>
                      <HistoryMapCamera group={group} center={historyGroupLastLocation(group)} zoom={15} />
                      {group.routePath ? (
                        <Mapbox.ShapeSource id={`h-rp-${group.id}`} shape={routeLineFeature(group.routePath) ?? undefined}>
                          <Mapbox.LineLayer id={`h-rl-${group.id}`} style={{ lineCap: 'round', lineColor: '#9ca9a2', lineDasharray: [2, 2], lineJoin: 'round', lineOpacity: 0.7, lineWidth: 3 }} />
                        </Mapbox.ShapeSource>
                      ) : null}
                      {group.trailPath ? (
                        <Mapbox.ShapeSource id={`h-trail-${group.id}`} shape={routeLineFeature(group.trailPath) ?? undefined}>
                          <Mapbox.LineLayer id={`h-trail-line-${group.id}`} style={{ lineCap: 'round', lineColor: '#c53030', lineJoin: 'round', lineOpacity: 0.95, lineWidth: 5 }} />
                        </Mapbox.ShapeSource>
                      ) : null}
                      {firstRouteCoordinate(routeLineFeature(group.trailPath)) ? (
                        <Mapbox.PointAnnotation
                          coordinate={firstRouteCoordinate(routeLineFeature(group.trailPath)) as [number, number]}
                          id={`h-trail-start-${group.id}`}
                        >
                          <View style={styles.historyTrailStartMarker} />
                        </Mapbox.PointAnnotation>
                      ) : null}
                      {lastRouteCoordinate(routeLineFeature(group.trailPath)) ? (
                        <Mapbox.PointAnnotation
                          coordinate={lastRouteCoordinate(routeLineFeature(group.trailPath)) as [number, number]}
                          id={`h-trail-end-${group.id}`}
                        >
                          <View style={styles.historyTrailEndMarker} />
                        </Mapbox.PointAnnotation>
                      ) : null}
                    </Mapbox.MapView>
                  ) : (
                    <View style={styles.historyMapFallback}>
                      <Feather color="#14a87d" name="map" size={20} />
                      <Text style={styles.historyMapFallbackText}>Route map</Text>
                    </View>
                  )}
                </View>
                <View style={styles.historyCardBody}>
                  <Text numberOfLines={1} style={styles.historyCardTitle}>{group.routeName}</Text>
                  <Text numberOfLines={1} style={styles.historyCardDate}>{group.date} · {displayBarangay(group.barangay)}</Text>
                  <View style={styles.historyCardMetricRow}>
                    <Text style={styles.historyCardDistance}>{group.distanceMi.toFixed(1)} mi</Text>
                    <View style={styles.historyCardPillRow}>
                      <View style={styles.historyMiniMetric}><Feather color="#8d9a93" name="trending-up" size={9} /><Text style={styles.historyMiniMetricText}>{group.elevationGainFt} ft</Text></View>
                      <View style={styles.historyMiniMetric}><Feather color="#8d9a93" name="trending-down" size={9} /><Text style={styles.historyMiniMetricText}>{group.elevationLossFt} ft</Text></View>
                    </View>
                  </View>
                </View>
                <Feather color="#5A6761" name="chevron-right" size={20} />
              </View>
            </Pressable>
            </RevealRow>
          )) : <View style={styles.emptyCard}><Feather color="#7d8c84" name="archive" size={18} /><Text style={styles.emptyStateText}>{historyLoadError || 'No past collections yet. After finishing your first collection, it will appear here.'}</Text></View>}
          </SkeletonRegion>
          {historyGroups.length > 3 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showAllPastCollections ? 'Show fewer past collections' : `View all ${historyGroups.length} past collections`}
              accessibilityState={{ expanded: showAllPastCollections }}
              testID="collector-history-toggle"
              onPress={() => setShowAllPastCollections((current) => !current)}
              style={styles.stopsToggle}
            >
              <Text style={styles.stopsToggleText}>{showAllPastCollections ? 'Show fewer' : `View all ${historyGroups.length} collections`}</Text>
              <MotionChevron expanded={showAllPastCollections}><Feather name="chevron-down" color="#086B42" size={20} /></MotionChevron>
            </Pressable>
          )}
        </View>
      </ScrollView>
    </View>
  );

  const profileScreen = (
    <View style={styles.profileScreen}>
      <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
        <PhoneNotificationControls role="driver" tracking={routePresence.enabled} />
        <SkeletonRegion state={profileSkeleton} placeholder={<SkeletonBlock height={226} radius={24} />}>
        <View style={styles.collectorProfileCard}>
          <CollectorGradient />
          <View style={styles.profileIdentity}>
            <ResidentAvatar uri={profile?.profilePhotoUrl} name={profile?.name} size={72}/>
            <View style={styles.flexText}>
              <Text style={styles.collectorName}>{collectorName}</Text>
              <Text style={styles.collectorRole}>Driver · {barangay}</Text>
              <View style={styles.profilePills}><View style={styles.collectorPill}><Text style={styles.collectorPillText}>Driver</Text></View><View style={styles.onShiftPill}><Text style={styles.onShiftText}>{displayShift(profile?.shift)}</Text></View></View>
            </View>
          </View>
          <View style={styles.statsRow}>
            {[[String(completed), 'Collected'], [String(reviewCount), 'For review'], [String(pending), 'Pending']].map(([value, label], index) => <View key={label} style={[styles.statCard, index > 0 && styles.statDivider]}><Text numberOfLines={1} style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.statCaption}>stops</Text></View>)}
          </View>
        </View>
        </SkeletonRegion>
        <View style={styles.profileSyncCard}>
          <View style={styles.detailIconBadge}><Feather color={isOffline || loadError ? '#B3261E' : '#0A7F4F'} name={isOffline ? 'wifi-off' : loadError ? 'alert-circle' : 'wifi'} size={20} /></View>
          <View style={styles.syncCopy}><Text style={styles.syncBottomText}>{loadError || (isOffline ? 'Offline mode (using saved route)' : isLoading ? 'Refreshing driver data…' : 'Driver data is up to date')}</Text><Text style={styles.syncCount}>Needs sync · {pendingRouteLogs}</Text></View>
          <Pressable disabled={!session || isLoading} onPress={() => session && void loadDriverData(session.token, collectorId)} style={[styles.syncButton, (!session || isLoading) && styles.syncButtonDisabled]}><Text style={styles.syncButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text></Pressable>
        </View>

        {assignedRoute && <View style={[styles.offlineMapCard, styles.offlineMapCardAfterSync]}>
          <View style={styles.offlineMapRow}>
            <View style={styles.detailIconBadge}><Feather name={offlineMap.downloaded ? 'check' : 'download'} size={20} color="#0A7F4F" /></View>
            <View style={styles.offlineMapTextWrap}>
              <Text style={styles.offlineMapTitle}>{offlineMap.downloaded ? 'Map downloaded' : offlineMap.downloading ? `Downloading map - ${offlineMap.percentage}%` : 'Download route map'}</Text>
              <Text style={styles.offlineMapCaption}>{offlineMapMessage || (offlineMap.downloaded ? `${formatStorage(offlineMap.completedSizeBytes)} stored on this phone.` : 'Save this assigned route map for use without mobile data.')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={offlineMap.downloaded ? 'Route map downloaded for offline use' : 'Download route map'} accessibilityState={{ disabled: offlineMap.downloaded || isUpdatingOfflineMap || offlineMap.downloading }} disabled={offlineMap.downloaded || isUpdatingOfflineMap || offlineMap.downloading} onPress={() => void toggleOfflineMap()} style={[styles.offlineMapButton, offlineMap.downloaded && styles.offlineMapButtonDownloaded, (offlineMap.downloaded || isUpdatingOfflineMap || offlineMap.downloading) && styles.geofenceButtonDisabled]}>
              <Feather color={offlineMap.downloaded ? '#086B42' : '#286349'} name={offlineMap.downloaded ? 'check-circle' : 'download'} size={16} />
              <Text style={[styles.offlineMapButtonText, offlineMap.downloaded && styles.offlineMapButtonTextSaved]}>{offlineMap.downloaded ? 'Downloaded' : offlineMap.downloading ? 'Downloading…' : isUpdatingOfflineMap ? 'Working…' : 'Download'}</Text>
            </Pressable>
          </View>
        </View>}
        <View style={styles.accountCard}>
          <Text style={styles.accountHeading}>ACCOUNT DETAILS</Text>
          <SkeletonRegion state={profileSkeleton} placeholder={<SkeletonRows kind="account" count={6} />}>
          <AccountDetail label="Contact" value={profile?.phone || profile?.contact || 'Not provided'} />
          <AccountDetail label="Location" value={profile?.location || 'Not provided'} />
          <AccountDetail label="Email" value={profile?.email || 'Not provided'} />
          <AccountDetail label="Shift" value={displayShift(profile?.shift)} />
          <AccountDetail label="Assigned route" value={assignedRoute?.name || 'No route scheduled today'} />
          <AccountDetail label="Assigned truck" value={assignedRoute?.assignedTruck ? `${assignedRoute.assignedTruck.truckNumber || 'Truck'} · ${assignedRoute.assignedTruck.plateNumber || 'No plate'}` : 'No truck assigned'} />
          </SkeletonRegion>
        </View>

        <Pressable accessibilityRole="button" onPress={() => setEditingProfile(true)} style={{ minHeight: 56, borderRadius: 16, backgroundColor: '#E3F4EB', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: 20 }}><Feather name="edit-2" size={20} color="#086B42"/><Text style={{ color: '#086B42', fontSize: 16, fontWeight: '600' }}>Edit profile</Text></Pressable>
        <ProfileSettingsRow onSignOut={completeSignOut} />
        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Feather color="#B3261E" name="log-out" size={20} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

    </View>
  );

  const renderHistoryTrailMap = () => (MAPBOX_ACCESS_TOKEN && selectedHistoryGroup ? (
                      <Mapbox.MapView scaleBarEnabled={false} styleURL={isDarkTheme ? Mapbox.StyleURL.Dark : Mapbox.StyleURL.Street} style={styles.segmentTrailMap} logoEnabled attributionEnabled scrollEnabled={isHistoryMapExpanded} pitchEnabled={false} rotateEnabled={false} zoomEnabled={isHistoryMapExpanded}>
                        <HistoryMapCamera group={selectedHistoryGroup} center={historyGroupLastLocation(selectedHistoryGroup)} zoom={16} />
                        {selectedHistoryGroup.routePath ? (
                          <Mapbox.ShapeSource id={`d-rp-${selectedHistoryGroup.id}`} shape={routeLineFeature(selectedHistoryGroup.routePath) ?? undefined}>
                            <Mapbox.LineLayer id={`d-expected-${selectedHistoryGroup.id}`} style={{ lineCap: 'round', lineColor: '#9ca9a2', lineDasharray: [2, 2], lineJoin: 'round', lineOpacity: 0.75, lineWidth: 4 }} />
                          </Mapbox.ShapeSource>
                        ) : null}
                        {selectedHistoryGroup.trailPath ? (
                          <Mapbox.ShapeSource id={`d-covered-${selectedHistoryGroup.id}`} shape={routeLineFeature(selectedHistoryGroup.trailPath) ?? undefined}>
                            <Mapbox.LineLayer id={`d-covered-line-${selectedHistoryGroup.id}`} style={{ lineCap: 'round', lineColor: '#c53030', lineJoin: 'round', lineOpacity: 0.9, lineWidth: 5 }} />
                          </Mapbox.ShapeSource>
                        ) : null}
                        {selectedHistoryGroup.firstEntry ? (
                          <Mapbox.PointAnnotation coordinate={firstRouteCoordinate(routeLineFeature(selectedHistoryGroup.trailPath)) || historyGroupLastLocation(selectedHistoryGroup) || MAP_CENTER} id={`d-entry-${selectedHistoryGroup.id}`}>
                            <View style={styles.trailEntryMarker}><Text style={styles.trailMarkerText}>Entry</Text></View>
                          </Mapbox.PointAnnotation>
                        ) : null}
                        {selectedHistoryGroup.lastExit && lastRouteCoordinate(routeLineFeature(selectedHistoryGroup.trailPath)) ? (
                          <Mapbox.PointAnnotation coordinate={lastRouteCoordinate(routeLineFeature(selectedHistoryGroup.trailPath)) as [number, number]} id={`d-exit-${selectedHistoryGroup.id}`}>
                            <View style={styles.trailExitMarker}><Text style={styles.trailExitMarkerText}>Exit</Text></View>
                          </Mapbox.PointAnnotation>
                        ) : null}
                        {selectedHistoryGroup.stopLogs.filter((stopLog) => Number.isFinite(Number(stopLog.latitude)) && Number.isFinite(Number(stopLog.longitude))).map((stopLog, index) => (
                          <Mapbox.PointAnnotation
                            coordinate={[Number(stopLog.longitude), Number(stopLog.latitude)]}
                            id={`d-stop-${selectedHistoryGroup.id}-${stopLog.stopId || index}`}
                            key={`${stopLog.stopId || 'stop'}-${index}`}
                          >
                            <View style={[styles.historyStopMarker, stopLog.flaggedForReview && styles.historyStopMarkerFlagged]}><Text style={styles.historyStopMarkerText}>{index + 1}</Text></View>
                          </Mapbox.PointAnnotation>
                        ))}
                      </Mapbox.MapView>
                    ) : (
                      <View style={styles.segmentTrailPlaceholder}>
                        <Feather color="#8d9a93" name="map" size={28} />
                        <Text style={styles.segmentTrailCaption}>Route trail</Text>
                      </View>
                    ));

  if (editingProfile) return <WorkProfileEditor onClose={() => setEditingProfile(false)} onSaved={updated => { setSession(updated); setDriver(updated.user); }}/>;

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, isDarkTheme && { backgroundColor: '#101815' }]}>
      <StatusBar backgroundColor={isDarkTheme ? '#101815' : '#ffffff'} style={isDarkTheme ? 'light' : 'dark'} translucent={false} />
      <View style={[styles.header, { paddingTop: insets.top }]}><View style={styles.brandHeader}><BrandMark height={48} width={150} /><View style={styles.headerCopy}><Text numberOfLines={1} adjustsFontSizeToFit style={styles.headerTitle}>{collectorName || 'Driver'}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={styles.headerSubtitle}>Route Driver</Text></View></View></View>
      <View style={[styles.content, isDarkTheme && { backgroundColor: '#101815' }]}><TabTransition activeKey={activeTab}>{activeTab === 'map' ? mapScreen : activeTab === 'history' ? historyScreen : profileScreen}</TabTransition></View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      <Modal animationType="slide" onRequestClose={() => isHistoryMapExpanded ? setIsHistoryMapExpanded(false) : setIsHistoryDetailVisible(false)} presentationStyle="fullScreen" visible={isHistoryDetailVisible}>
        <SafeAreaView style={styles.historyDetailBackdrop}>
          <View style={styles.historyDetailSheet}>
            {isHistoryMapExpanded ? <View style={{ flex: 1, padding: 16, gap: 12 }}>
              <Pressable accessibilityRole="button" accessibilityLabel="Back to route history report" onPress={() => setIsHistoryMapExpanded(false)} style={styles.offlineMapButton}><Feather name="arrow-left" size={20} color="#0A7F4F" /><Text>Back to report</Text></Pressable>
              <Text style={styles.historySectionLabel}>{selectedHistoryGroup?.routeName || 'Recorded trip'}</Text>
              <View style={{ flex: 1, borderRadius: 20, overflow: 'hidden' }}>{renderHistoryTrailMap()}</View>
              <Text style={styles.segmentTrailCaption}>{selectedHistoryGroup?.pendingSync ? 'Saved on this phone; waiting to sync. ' : ''}{selectedHistoryGroup?.trailPath ? 'Red: recorded travel. ' : 'No GPS line was recorded for this trip. '}{selectedHistoryGroup?.routePath ? 'Dashed: assigned route. ' : 'No assigned route line is available. '}Pinch to zoom and drag to explore.</Text>
            </View> : null}
            <ScrollView style={isHistoryMapExpanded ? { display: 'none' } : undefined} scrollEnabled={!isHistoryMapExpanded} contentContainerStyle={[styles.historyDetailScroll, isHistoryMapExpanded && { flexGrow: 1 }]} showsVerticalScrollIndicator={false}>
            <View style={styles.historyDetailHeader}>
              <View style={styles.flexText}>
                <Text style={styles.historyDetailEyebrow}>ROUTE HISTORY REPORT</Text>
                <Text style={styles.historyDetailTitle}>{selectedHistoryGroup?.routeName || 'Collection details'}</Text>
                <Text style={styles.historyDetailSubtitle}>Barangay {selectedHistoryGroup ? displayBarangay(selectedHistoryGroup.barangay) : ''} · {selectedHistoryGroup?.date || ''}</Text>
              </View>
              <Pressable accessibilityLabel="Close route history" onPress={() => { setIsHistoryMapExpanded(false); setIsHistoryDetailVisible(false); }} style={styles.historyDetailClose}>
                <Feather color="#314238" name="x" size={20} />
              </Pressable>
            </View>
              <View style={[styles.historyDetailSegment, isHistoryMapExpanded && { flex: 1 }]}><Pressable accessibilityRole="button" onPress={() => setIsHistoryMapExpanded(value => !value)} style={styles.offlineMapButton}><Feather name={isHistoryMapExpanded ? "minimize-2" : "maximize-2"} size={18} color="#0A7F4F" /><Text>{isHistoryMapExpanded ? "Back to report" : "View full map"}</Text></Pressable>
                <Text style={styles.historySectionLabel}>SEGMENT TRAIL</Text>
                <View style={styles.segmentTrailPanel}>
                  <View style={[styles.segmentTrailMapWrap, isHistoryMapExpanded && { flex: 1 }]}>
                    {!isHistoryMapExpanded ? renderHistoryTrailMap() : null}
                  </View>
                  {!selectedHistoryGroup?.trailPath ? <Text style={styles.segmentTrailCaption}>No recorded GPS trail is available for this trip yet. The dashed line is the assigned route, not the recorded travel. GPS recording needs at least two valid location readings.</Text> : null}
                  <View style={styles.segmentTrailLegend}>
                    <Text style={styles.historySectionLabel}>LEGEND</Text>
                    <View style={styles.legendRow}>
                      <View style={[styles.legendSwatch, { backgroundColor: '#c53030' }]} />
                      <Text style={styles.legendText}>Recorded GPS trail</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={[styles.legendSwatch, styles.legendSwatchDashed]} />
                      <Text style={styles.legendText}>Assigned route (reference)</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.trailEntryDot} />
                      <Text style={styles.legendText}>Stop entry: {selectedHistoryGroup?.firstEntry ? formatTime(selectedHistoryGroup.firstEntry) : 'Not recorded'}</Text>
                    </View>
                    <View style={styles.legendRow}>
                      <View style={styles.trailExitDot} />
                      <Text style={[styles.legendText, !selectedHistoryGroup?.lastExit && styles.detailValueRed]}>Stop exit: {selectedHistoryGroup?.lastExit ? formatTime(selectedHistoryGroup.lastExit) : 'Not recorded'}</Text>
                    </View>
                    {selectedHistoryGroup?.stopLogs.some((stopLog) => Number.isFinite(Number(stopLog.latitude)) && Number.isFinite(Number(stopLog.longitude))) ? (
                      <View style={styles.legendRow}>
                        <View style={styles.trailStopDot} />
                        <Text style={styles.legendText}>Numbered markers: collected stops</Text>
                      </View>
                    ) : null}
                    {(selectedHistoryGroup?.flagged ?? 0) > 0 ? (
                      <View style={styles.legendRow}>
                        <Feather color="#c53030" name="flag" size={11} />
                        <Text style={styles.legendText}>Dwell: {(selectedHistoryGroup?.flagged ?? 0)} stop{(selectedHistoryGroup?.flagged ?? 0) === 1 ? '' : 's'} flagged for review</Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <Text style={styles.segmentFigCaption}>Red: recorded travel, including outside the assigned route. Dashed: assigned route reference. Stop entry and exit are separate events.</Text>
              </View>
              <View style={styles.historyDetailTwoCol}>
                <View style={styles.historyDetailColLeft}>
                  <Text style={styles.historySectionLabel}>RECORD SUMMARY</Text>
                  <View style={styles.detailTable}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Street Segment</Text>
                      <Text style={styles.detailValue}>{selectedHistoryGroup?.routeName || '—'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Driver Name</Text>
                      <View>
                        <Text style={styles.detailValue}>{collectorName}</Text>
                        <Text style={styles.detailSubvalue}>{profile?.employeeId ? `${profile.employeeId} · SWMO Naga City` : 'SWMO Naga City'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Truck Assigned</Text>
                      <Text style={styles.detailValue}>Per collection shift</Text>
                    </View>
                    <View style={styles.detailRowTwoCol}>
                      <View style={styles.detailCell}>
                        <Text style={styles.detailLabel}>Shift Start</Text>
                        <Text style={styles.detailValue}>{selectedHistoryGroup?.sessionStartedAt ? formatTime(selectedHistoryGroup.sessionStartedAt) : selectedHistoryGroup?.firstEntry ? formatTime(selectedHistoryGroup.firstEntry) : '—'}</Text>
                      </View>
                      <View style={styles.detailCell}>
                        <Text style={styles.detailLabel}>Shift End</Text>
                        <Text style={styles.detailValue}>{selectedHistoryGroup?.sessionEndedAt ? formatTime(selectedHistoryGroup.sessionEndedAt) : selectedHistoryGroup?.lastExit ? formatTime(selectedHistoryGroup.lastExit) : '—'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRowTwoCol}>
                      <View style={styles.detailCell}>
                        <Text style={styles.detailLabel}>Geofence Entry</Text>
                        <Text style={styles.detailValue}>{selectedHistoryGroup?.firstEntry ? formatTime(selectedHistoryGroup.firstEntry) : 'Not recorded'}</Text>
                      </View>
                      <View style={styles.detailCell}>
                        <Text style={styles.detailLabel}>Geofence Exit</Text>
                        <Text style={[styles.detailValue, !selectedHistoryGroup?.lastExit && styles.detailValueRed]}>{selectedHistoryGroup?.lastExit ? formatTime(selectedHistoryGroup.lastExit) : 'Not logged — no exit event'}</Text>
                      </View>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Segment Status</Text>
                      <Text style={[styles.detailValue, selectedHistoryGroup && selectedHistoryGroup.collected < selectedHistoryGroup.totalStops ? styles.detailValueRed : styles.detailValueGreen]}>
                        {selectedHistoryGroup ? `${selectedHistoryGroup.collected}/${selectedHistoryGroup.totalStops} stops collected${selectedHistoryGroup.flagged ? ` · ${selectedHistoryGroup.flagged} flagged` : ''}` : '—'}
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.historyDetailColRight}>
                  <Text style={styles.historySectionLabel}>DOCUMENT REFERENCE</Text>
                  <View style={[styles.detailTable, styles.detailTableRef]}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>REFERENCE ID</Text>
                      <Text style={styles.detailValueMono}>{`RH-${(selectedHistoryGroup?.date || '0000-00-00').replace(/-/g, '').slice(0, 4)}-${(selectedHistoryGroup?.date || '').replace(/-/g, '').slice(4)}-${String(Array.isArray(selectedHistoryGroup?.barangay) ? selectedHistoryGroup.barangay.join(' ') : (selectedHistoryGroup?.barangay || 'UNK')).slice(0, 3).toUpperCase()}-001`}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>REPORT DATE</Text>
                      <Text style={styles.detailValue}>{selectedHistoryGroup?.date || '—'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>AREA</Text>
                      <Text style={styles.detailValue}>{selectedHistoryGroup ? `Barangay ${displayBarangay(selectedHistoryGroup.barangay)}, Naga City` : '—'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>STATUS</Text>
                      <Text style={[styles.detailValue, (selectedHistoryGroup?.flagged ?? 0) > 0 ? styles.detailValueRedBold : styles.detailValueGreenBold]}>
                        {(selectedHistoryGroup?.flagged ?? 0) > 0 ? 'FLAGGED — REVIEW REQUIRED' : 'COLLECTED — VERIFIED'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>GENERATED BY</Text>
                      <Text style={styles.detailValue}>Driver — {collectorName}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>EXPORTED</Text>
                      <Text style={styles.detailValue}>{new Intl.DateTimeFormat('en-CA', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Manila', hour12: false }).format(new Date()).replace(',', ' · ')}</Text>
                    </View>
                  </View>
                </View>
              </View>
              {selectedHistoryGroup?.stopLogs?.length ? (
                <View style={styles.historyDetailStops}>
                  <Text style={styles.historySectionLabel}>STOP LOGS</Text>
                  {selectedHistoryGroup.stopLogs.map((log, idx) => (
                    <View key={`${log.stopId}-${idx}`} style={styles.stopLogCard}>
                      <View style={[styles.stopLogDot, log.flaggedForReview ? styles.stopLogDotReview : styles.stopLogDotCollected]} />
                      <View style={styles.stopLogInfo}>
                        <View style={styles.stopLogHeaderRow}>
                          <Text style={styles.stopLogName}>{log.stopName || `Stop #${idx + 1}`}</Text>
                          {log.flaggedForReview ? (
                            <View style={styles.stopLogFlag}>
                              <Feather color="#ffffff" name="flag" size={9} />
                              <Text style={styles.stopLogFlagText}>Flagged</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.stopLogMeta}>
                          {formatTime(log.collectedAt)} — {log.exitedAt ? formatTime(log.exitedAt) : 'No exit'}
                          {typeof log.dwellSeconds === 'number' ? ` · ${log.dwellSeconds}s dwell` : ''}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>
      <FinishRouteModal
        busy={isSubmittingRoute}
        visible={isFinishRouteConfirmVisible}
        onCancel={() => setIsFinishRouteConfirmVisible(false)}
        onConfirm={() => void confirmRouteCompletion()}
      />
      <Modal
        animationType="fade"
        onRequestClose={() => setRouteActionMessage(null)}
        statusBarTranslucent
        transparent
        visible={Boolean(routeActionMessage) && !isFinishRouteConfirmVisible}
      >
        <View style={styles.finishRouteBackdrop}>
          <View style={styles.finishRouteCard}>
            <View style={[styles.finishRouteIcon, routeActionMessage?.kind === 'error' && styles.finishRouteIconError]}>
              <Feather color={routeActionMessage?.kind === 'error' ? '#c43d4c' : '#07815f'} name={routeActionMessage?.kind === 'error' ? 'alert-circle' : 'check-circle'} size={22} />
            </View>
            <Text style={styles.finishRouteTitle}>{routeActionMessage?.title}</Text>
            <Text style={styles.finishRouteMessage}>{routeActionMessage?.message}</Text>
            <Pressable accessibilityRole="button" onPress={() => { const retry = routeActionMessage?.retryCompletion; setRouteActionMessage(null); if (retry) void submitRoute(); }} style={styles.finishRouteDoneButton}>
              <Text style={styles.finishRouteDoneText}>{routeActionMessage?.retryCompletion ? 'Try again' : 'Done'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
      <RouteMonitoringConsentModal visible={isMonitoringConsentVisible} onCancel={() => respondToMonitoringConsent(false)} onEnable={() => respondToMonitoringConsent(true)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flexText: { flex: 1, minWidth: 0 },
  cardGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  // Keeps the secondary tint text above 4.5:1 even at the light gradient stop.
  cardGradientShade: { ...StyleSheet.absoluteFillObject, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.10)' },
  profileIdentity: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  statDivider: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)' },
  detailIconBadge: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3F4EB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  placeholderValue: { color: '#5A6761', fontWeight: '500' },
  syncCopy: { flexGrow: 1, flexShrink: 1, flexBasis: 130, minWidth: 0 },
  syncCount: { color: '#5A6761', fontSize: 13, marginTop: 4 },
  timelineRail: { width: 22, alignItems: 'center' },
  timelineLineCollected: { backgroundColor: '#0A7F4F' },
  timelineLine: { position: 'absolute', width: 2, top: 22, bottom: 0, backgroundColor: '#DCE4DF' },
  reviewText: { color: '#5C3B00', fontSize: 13, fontWeight: '600' },
  sectionHeading: { color: '#121A16', fontSize: 20, fontWeight: '700', marginBottom: 12 },
  navIconPill: { width: 56, height: 32, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  navIconPillActive: { backgroundColor: '#E3F4EB', borderRadius: 16 },
  header: { backgroundColor: '#ffffff' },
  brandHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 64, gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  headerCopy: { alignItems: 'flex-end', flex: 1, minWidth: 0 },
  headerTitle: { color: '#121A16', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  headerSubtitle: { color: '#5A6761', fontSize: 12, marginTop: 1, textAlign: 'right' },
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
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
  driverLocationMarker: { alignItems: 'center', backgroundColor: '#1976e8', borderColor: '#ffffff', borderRadius: 24, borderWidth: 3, height: 48, justifyContent: 'center', shadowColor: '#0d3c79', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.3, shadowRadius: 5, width: 48 },
  complaintMarker: { alignItems: 'center', backgroundColor: '#d44859', borderColor: '#ffffff', borderRadius: 20, borderWidth: 3, height: 38, justifyContent: 'center', shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 4, width: 38 },
  mapPlaceholderLabel: { alignItems: 'center', backgroundColor: 'rgba(248,252,249,0.88)', borderColor: '#c2d3c9', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, left: 20, paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', right: 20, top: '47%' },
  offlineMapBadge: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#eed3c4', borderRadius: 19, borderWidth: 1.5, elevation: 5, height: 38, justifyContent: 'center', left: 14, position: 'absolute', shadowColor: '#2b1408', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.16, shadowRadius: 4, width: 38, zIndex: 25 },
  mapPlaceholderText: { color: '#45685a', fontSize: 11, fontWeight: '700' },
  geofenceCard: { backgroundColor: 'rgba(255,255,255,0.96)', borderColor: '#cfe2d8', borderRadius: 13, borderWidth: 1, bottom: 12, left: 12, padding: 10, position: 'absolute', right: 12, shadowColor: '#234837', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8 },
  geofenceHeader: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between' },
  geofenceStatusRow: { alignItems: 'center', flex: 1, minWidth: 160, flexDirection: 'row', gap: 8 },
  geofenceTextWrap: { flex: 1 },
  geofenceTitle: { color: '#345345', fontSize: 11, fontWeight: '800' },
  geofenceCaption: { color: '#6d7d74', fontSize: 9, lineHeight: 13, marginTop: 2 },
  geofenceButton: { backgroundColor: '#07815f', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  geofenceButtonEnabled: { backgroundColor: '#edf6f1', borderColor: '#82b49d', borderWidth: 1 },
  geofenceButtonDisabled: { opacity: 0.62 },
  geofenceButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  geofenceButtonTextEnabled: { color: '#286349' },
  tripButton: { backgroundColor: '#0A7F4F', borderRadius: 14, minHeight: 48, paddingHorizontal: 16, paddingVertical: 12, justifyContent: 'center', alignItems: 'center' },
  tripEndButton: { backgroundColor: '#E3F4EB' },
  tripButtonText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
  monitoringSwitch: { backgroundColor: '#d7e1db', borderRadius: 14, height: 27, justifyContent: 'center', paddingHorizontal: 3, width: 48 },
  monitoringSwitchOn: { backgroundColor: '#14a87d' },
  monitoringSwitchThumb: { backgroundColor: '#ffffff', borderRadius: 11, height: 21, shadowColor: '#244738', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.16, shadowRadius: 2, width: 21 },
  monitoringSwitchThumbOn: { alignSelf: 'flex-end' },
  geofenceQueueText: { color: '#9b6816', fontSize: 9, fontWeight: '700', marginTop: 7 },
  capacityFloatingCard: { alignItems: 'center', backgroundColor: 'transparent', position: 'absolute', right: 12, top: 82, width: 94 },
  capacityCylinderLabel: { color: '#111111', fontSize: 7, fontWeight: '900', letterSpacing: 0.25, lineHeight: 10, marginBottom: 5, textAlign: 'center' },
  capacityCylinder: { backgroundColor: 'transparent', borderBottomLeftRadius: 21, borderBottomRightRadius: 21, borderColor: '#0b4b2b', borderTopLeftRadius: 15, borderTopRightRadius: 15, borderWidth: 2, height: 100, overflow: 'hidden', position: 'relative', width: 54 },
  capacityCylinderWarning: { borderColor: '#b56d0d' },
  capacityCylinderCritical: { borderColor: '#b81d1d' },
  capacityCylinderFill: { backgroundColor: '#0b4b2b', bottom: 0, left: 0, position: 'absolute', right: 0 },
  capacityCylinderFillWarning: { backgroundColor: '#b56d0d' },
  capacityCylinderFillCritical: { backgroundColor: '#b81d1d' },
  capacityCylinderTop: { backgroundColor: 'transparent', borderBottomColor: '#0b4b2b', borderBottomWidth: 1, height: 12, left: 0, position: 'absolute', right: 0, top: 0 },
  capacityCylinderTopWarning: { borderBottomColor: '#b56d0d' },
  capacityCylinderTopCritical: { borderBottomColor: '#b81d1d' },
  capacityCylinderPercent: { color: '#111111', fontSize: 15, fontWeight: '900', left: 0, position: 'absolute', right: 0, textAlign: 'center', top: 40 },
  capacityCylinderPercentCritical: { color: '#ffffff' },
  capacityNoLoadText: { color: '#111111', fontSize: 8, fontWeight: '800', left: 2, lineHeight: 11, position: 'absolute', right: 2, textAlign: 'center', top: 37 },
  capacityEmptiedButton: { backgroundColor: '#07815f', borderRadius: 8, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, width: '100%', alignItems: 'center' },
  capacityEmptiedButtonText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
  capacityEmptiedUndoButton: { backgroundColor: '#c77d10', borderRadius: 8, marginTop: 10, paddingVertical: 8, paddingHorizontal: 12, width: '100%', alignItems: 'center' },
  capacityEmptiedUndoText: { color: '#ffffff', fontSize: 9, fontWeight: '900' },
  routeProgressIndicator: { marginTop: 7, width: '100%' },
  routeProgressLabel: { color: '#111111', fontSize: 8, fontWeight: '900', marginBottom: 3, textAlign: 'center' },
  routeProgressTrack: { backgroundColor: 'rgba(11,75,43,0.2)', borderRadius: 3, height: 6, overflow: 'hidden' },
  routeProgressFill: { backgroundColor: '#0b4b2b', borderRadius: 3, height: '100%' },
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
  offlineMapCard: { backgroundColor: '#F4F6F5', borderRadius: 20, borderWidth: 0, marginTop: 24, padding: 16, gap: 0 },
  offlineMapCardAfterSync: { marginTop: 12 },
  offlineMapRow: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  offlineMapTextWrap: { flexGrow: 1, flexShrink: 1, flexBasis: 120, minWidth: 0 },
  offlineMapTitle: { color: '#121A16', fontSize: 16, fontWeight: '700' },
  offlineMapCaption: { color: '#5A6761', fontSize: 13, marginTop: 4 },
  offlineMapButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F4EB', borderRadius: 14, flexDirection: 'row', gap: 4, minHeight: 44, paddingHorizontal: 12, paddingVertical: 8 },
  offlineMapButtonDownloaded: { backgroundColor: '#E3F4EB', borderColor: '#B8DDC7' },
  offlineMapButtonText: { color: '#086B42', fontSize: 14, fontWeight: '700' },
  offlineMapButtonTextSaved: { color: '#086B42' },
  offlineMapButtonTextDownloaded: { color: '#9d3139' },
  finishRouteBackdrop: { alignItems: 'center', backgroundColor: 'rgba(13, 35, 25, 0.56)', flex: 1, justifyContent: 'center', padding: 22 },
  finishRouteCard: { backgroundColor: '#ffffff', borderRadius: 22, maxWidth: 360, paddingHorizontal: 22, paddingVertical: 24, shadowColor: '#102d20', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 18, width: '100%' },
  finishRouteIcon: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#e8f7ef', borderRadius: 30, height: 56, justifyContent: 'center', width: 56 },
  finishRouteIconError: { backgroundColor: '#fff0f1' },
  finishRouteTitle: { color: '#203b2d', fontSize: 20, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  finishRouteMessage: { color: '#687a70', fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  finishRouteDoneButton: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 11, justifyContent: 'center', marginTop: 21, minHeight: 45, paddingHorizontal: 28 },
  finishRouteDoneText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  historyHeader: { backgroundColor: '#176b3a', paddingBottom: 11, paddingHorizontal: 16, paddingTop: 10 },
  historyHeaderTop: { flexDirection: 'row', justifyContent: 'space-between' },
  assignedLabel: { color: '#9bc6ad', fontSize: 9, fontWeight: '800', letterSpacing: 0.5 },
  areaNameRow: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 4 },
  areaName: { color: '#ffffff', fontSize: 19, fontWeight: '800' },
  streetSubtitle: { color: '#a3c9b3', fontSize: 9, marginTop: 3, maxWidth: 215 },
  historyScrollContent: { padding: 20, paddingBottom: 24 },
  historyGroup: { marginTop: 24 },
  todayStopsSection: { marginTop: 0 },
  todayStopsHeading: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'space-between', marginBottom: 16 },
  todayStopsTitle: { color: '#121A16', fontSize: 20, fontWeight: '700' },
  todayStopsCount: { color: '#0A7F4F', fontSize: 16, fontWeight: '700' },
  stopsToggle: { alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, minHeight: 44, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: '#E3F4EB' },
  stopsToggleText: { color: '#086B42', fontSize: 14, fontWeight: '600', flexShrink: 1 },
  dateLabel: { color: '#0A7F4F', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 6 },
  emptyStateText: { color: '#5A6761', fontSize: 14, flex: 1, paddingVertical: 8 },
  streetCard: { alignItems: 'stretch', flexDirection: 'row', gap: 12, minHeight: 64 },
  streetMarker: { alignItems: 'center', justifyContent: 'center', borderRadius: 11, height: 22, width: 22, borderWidth: 2 },
  collectedMarker: { backgroundColor: '#0A7F4F', borderColor: '#0A7F4F' },
  notCollectedMarker: { backgroundColor: '#ffffff', borderColor: '#A9BDB1' },
  reviewMarker: { backgroundColor: '#FFF4E0', borderColor: '#9A6700' },
  streetInfo: { flex: 1, minWidth: 0, paddingBottom: 20 },
  streetName: { color: '#121A16', fontSize: 16, fontWeight: '600' },
  streetBarangay: { color: '#5A6761', fontSize: 13, marginTop: 3 },
  streetStatus: { alignItems: 'flex-end', maxWidth: '38%', paddingBottom: 20 },
  collectedPill: { backgroundColor: '#e8fbf1' },
  notCollectedPill: { backgroundColor: '#f0f3f1' },
  streetStatusText: { fontSize: 13, fontWeight: '600', textAlign: 'right' },
  streetTime: { color: '#5A6761', fontSize: 12, marginTop: 3, textAlign: 'right' },
  collectedText: { color: '#0A7F4F' },
  notCollectedText: { color: '#5A6761' },
  profileScrollContent: { padding: 20, paddingBottom: 24 },
  collectorProfileCard: { backgroundColor: '#0D2E27', borderRadius: 24, overflow: 'hidden', padding: 20 },
  avatar: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 32, height: 64, justifyContent: 'center', width: 64, flexShrink: 0 },
  avatarImage: { borderRadius: 32, height: 64, width: 64 },
  avatarText: { color: '#0B5D44', fontSize: 24, fontWeight: '700' },
  collectorName: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  collectorRole: { color: '#E3F4EB', fontSize: 14, marginTop: 4 },
  collectorBarangay: { color: '#8d9a93', fontSize: 10, marginTop: 3 },
  profilePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  collectorPill: { backgroundColor: 'rgba(13,46,39,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  collectorPillText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  onShiftPill: { backgroundColor: 'rgba(13,46,39,0.45)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  onShiftText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)' },
  statCard: { flex: 1, minWidth: 0, paddingHorizontal: 6 },
  statValue: { color: '#ffffff', fontSize: 30, fontWeight: '700' },
  statLabel: { color: '#E3F4EB', fontSize: 13, marginTop: 4 },
  statCaption: { color: '#E3F4EB', fontSize: 13 },
  profileSyncCard: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 20, flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24, padding: 16 },
  profileSyncLabel: { color: '#415348', fontSize: 10, fontWeight: '900', letterSpacing: 0.45 },
  profileSyncNumber: { color: '#0b4b2b', fontSize: 24, fontWeight: '900' },
  accountCard: { backgroundColor: '#ffffff', borderWidth: 0, marginTop: 24, padding: 0, gap: 0 },
  accountHeading: { color: '#121A16', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E3EAE6' },
  accountLabel: { color: '#5A6761', fontSize: 12 },
  accountValue: { color: '#121A16', fontSize: 15, fontWeight: '600', marginTop: 2 },
  signOutButton: { alignItems: 'center', backgroundColor: '#FDECEA', borderRadius: 16, flexDirection: 'row', gap: 10, minHeight: 52, padding: 12, justifyContent: 'center', marginTop: 24 },
  signOutText: { color: '#B3261E', fontSize: 16, fontWeight: '700' },
  syncBottomBar: { alignItems: 'center', backgroundColor: '#ffffff', borderTopColor: '#e0e8e3', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 57, paddingHorizontal: 13 },
  syncBottomTextWrap: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 6 },
  syncBottomText: { color: '#121A16', fontSize: 15, fontWeight: '600' },
  syncButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F4EB', borderRadius: 14, minHeight: 44, paddingHorizontal: 14, paddingVertical: 8 },
  syncButtonDisabled: { opacity: 0.5 },
  syncButtonText: { color: '#086B42', fontSize: 14, fontWeight: '700' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#E3EAE6', borderTopWidth: 1, flexDirection: 'row', paddingTop: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 4, gap: 4 },
  navText: { color: '#5A6761', fontSize: 12, fontWeight: '500' },
  navTextActive: { color: '#086B42', fontWeight: '700' },
  navIndicator: { backgroundColor: '#07815f', borderRadius: 3, height: 3, marginTop: 4, width: 4 },
  navIndicatorPlaceholder: { height: 3, marginTop: 4, width: 4 },
  streetNameRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  flagChip: { alignItems: 'center', backgroundColor: '#9d3139', borderRadius: 7, flexDirection: 'row', gap: 2, paddingHorizontal: 5, paddingVertical: 2 },
  flagChipText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  emptyCard: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 20, borderWidth: 0, flexDirection: 'row', gap: 10, padding: 16 },
  historyCardWrap: { marginBottom: 12 },
  historyCard: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 20, borderWidth: 0, flexDirection: 'row', gap: 12, padding: 12 },
  historyCardMap: { backgroundColor: '#CFE3D8', borderRadius: 14, height: 96, width: 96, flexShrink: 0, overflow: 'hidden' },
  historyMapPreview: { flex: 1 },
  historyMapFallback: { alignItems: 'center', flex: 1, gap: 5, justifyContent: 'center' },
  historyMapFallbackText: { color: '#4d7e69', fontSize: 9, fontWeight: '700' },
  historyCardBody: { flex: 1, minWidth: 0 },
  historyCardTitle: { color: '#121A16', fontSize: 16, fontWeight: '700' },
  historyCardDate: { color: '#5A6761', fontSize: 13, marginTop: 3 },
  historyCardMetricRow: { marginTop: 6, gap: 4 },
  historyCardDistance: { color: '#0A7F4F', fontSize: 22, fontWeight: '700' },
  historyCardPillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  historyMiniMetric: { alignItems: 'center', flexDirection: 'row', gap: 3 },
  historyMiniMetricText: { color: '#5A6761', fontSize: 12 },
  historyCardBottom: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 7 },
  historyFlag: { alignItems: 'center', borderRadius: 7, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 3 },
  historyFlagOff: { backgroundColor: '#f0f3f1' },
  historyFlagOn: { backgroundColor: '#8d53ce' },
  historyFlagText: { fontSize: 8, fontWeight: '700' },
  historyFlagTextOn: { color: '#ffffff' },
  greeneryPill: { alignItems: 'center', backgroundColor: '#e8fbf1', borderRadius: 7, flexDirection: 'row', gap: 3, paddingHorizontal: 6, paddingVertical: 3 },
  greeneryText: { color: '#07815f', fontSize: 8, fontWeight: '700' },
  historyNoMetricText: { color: '#87948d', fontSize: 8, fontWeight: '700' },
  historyTrailStartMarker: { backgroundColor: '#c53030', borderColor: '#ffffff', borderRadius: 7, borderWidth: 2, height: 14, shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.35, shadowRadius: 2, width: 14 },
  historyTrailEndMarker: { backgroundColor: '#ffffff', borderColor: '#c53030', borderRadius: 7, borderWidth: 3, height: 14, shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.25, shadowRadius: 2, width: 14 },
  historyDetailBackdrop: { backgroundColor: '#ffffff', flex: 1 },
  historyDetailSheet: { backgroundColor: '#ffffff', flex: 1 },
  historyDetailHeader: { alignItems: 'flex-start', flexDirection: 'row', gap: 12 },
  historyDetailEyebrow: { color: '#0A7F4F', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  historyDetailTitle: { color: '#121A16', fontSize: 28, fontWeight: '700', marginTop: 6 },
  historyDetailSubtitle: { color: '#5A6761', fontSize: 14, marginTop: 6 },
  historyDetailClose: { alignItems: 'center', backgroundColor: '#EEF3F0', borderRadius: 22, height: 44, justifyContent: 'center', width: 44, flexShrink: 0 },
  historyDetailScroll: { paddingVertical: 24, paddingHorizontal: 20, gap: 24 },
  historyDetailTwoCol: { gap: 24 },
  historyDetailColLeft: { minWidth: 0 },
  historyDetailColRight: { minWidth: 0 },
  historySectionLabel: { color: '#121A16', fontSize: 18, fontWeight: '700', marginBottom: 12 },
  detailTable: { backgroundColor: '#F4F6F5', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 4 },
  detailTableRef: { backgroundColor: '#F4F6F5' },
  detailRow: { borderBottomColor: '#E3EAE6', borderBottomWidth: 1, paddingVertical: 14 },
  detailRowTwoCol: { borderBottomColor: '#E3EAE6', borderBottomWidth: 1, flexDirection: 'row', gap: 16, paddingVertical: 14 },
  detailCell: { flex: 1, minWidth: 0 },
  detailLabel: { color: '#5A6761', fontSize: 12, marginBottom: 4 },
  detailValue: { color: '#121A16', fontSize: 15, fontWeight: '600' },
  detailValueMono: { color: '#121A16', fontSize: 15, fontWeight: '600' },
  detailSubvalue: { color: '#5A6761', fontSize: 12, marginTop: 3 },
  detailValueRed: { color: '#B3261E', fontWeight: '600' },
  detailValueGreen: { color: '#086B42', fontWeight: '600' },
  detailValueRedBold: { color: '#B3261E', fontWeight: '700' },
  detailValueGreenBold: { color: '#086B42', fontWeight: '700' },
  historyDetailSegment: { gap: 0 },
  segmentTrailPanel: { gap: 16 },
  segmentTrailMapWrap: { backgroundColor: '#E3EAE6', borderRadius: 20, height: 190, overflow: 'hidden' },
  segmentTrailMap: { flex: 1 },
  segmentTrailPlaceholder: { alignItems: 'center', flex: 1, gap: 6, justifyContent: 'center' },
  segmentTrailCaption: { color: '#65766c', fontSize: 9, fontWeight: '700' },
  segmentTrailLegend: { gap: 4 },
  segmentFigCaption: { color: '#5A6761', fontSize: 12, fontStyle: 'italic', marginTop: 12 },
  legendRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginBottom: 7 },
  legendSwatch: { borderRadius: 2, height: 4, width: 22 },
  legendSwatchDashed: { backgroundColor: 'transparent', borderBottomColor: '#c53030', borderBottomWidth: 2, borderStyle: 'dashed', height: 2, width: 22 },
  legendText: { color: '#121A16', flex: 1, minWidth: 0, fontSize: 14 },
  trailEntryDot: { backgroundColor: '#c53030', borderRadius: 5, height: 10, width: 10 },
  trailExitDot: { backgroundColor: '#aeb8b2', borderColor: '#7f8b84', borderRadius: 5, borderWidth: 1.5, height: 10, width: 10 },
  trailStopDot: { backgroundColor: '#07815f', borderColor: '#ffffff', borderRadius: 5, borderWidth: 1.5, height: 10, width: 10 },
  trailEntryMarker: { alignItems: 'center', backgroundColor: '#c53030', borderColor: '#ffffff', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', paddingHorizontal: 4, shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3 },
  trailExitMarker: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#c53030', borderRadius: 10, borderWidth: 2, height: 20, justifyContent: 'center', paddingHorizontal: 4, shadowColor: '#7a1f2e', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.25, shadowRadius: 3 },
  trailExitMarkerText: { color: '#c53030', fontSize: 7, fontWeight: '800' },
  historyStopMarker: { alignItems: 'center', backgroundColor: '#07815f', borderColor: '#ffffff', borderRadius: 8, borderWidth: 2, height: 16, justifyContent: 'center', width: 16 },
  historyStopMarkerFlagged: { backgroundColor: '#8d53ce' },
  historyStopMarkerText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  trailMarkerText: { color: '#ffffff', fontSize: 7, fontWeight: '800' },
  historyDetailStops: { marginTop: 16 },
  stopLogCard: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 20, borderWidth: 0, flexDirection: 'row', marginBottom: 12, minHeight: 60, padding: 12 },
  stopLogDot: { borderRadius: 4, height: 26, width: 5 },
  stopLogDotCollected: { backgroundColor: '#10c990' },
  stopLogDotReview: { backgroundColor: '#9A6700' },
  stopLogInfo: { flex: 1, marginLeft: 10, paddingVertical: 8 },
  stopLogHeaderRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  stopLogName: { color: '#121A16', fontSize: 15, fontWeight: '600', flexShrink: 1 },
  stopLogFlag: { alignItems: 'center', backgroundColor: '#9d3139', borderRadius: 6, flexDirection: 'row', gap: 2, paddingHorizontal: 5, paddingVertical: 2 },
  stopLogFlagText: { color: '#ffffff', fontSize: 8, fontWeight: '800' },
  stopLogMeta: { color: '#5A6761', fontSize: 12, marginTop: 4 },
});
