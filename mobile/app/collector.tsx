import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Mapbox from '@rnmapbox/maps';
import { useRouter } from 'expo-router';
import { Card } from 'heroui-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { enableDriverGeofencing, getDriverGeofencingStatus, stopDriverGeofencing, updateDriverGeofences } from '@/lib/driver-geofencing';
import { getRouteLogQueueStats, subscribeToRouteLogSync, syncRouteLogQueue, type RouteLogSyncResult } from '@/lib/driver-route-log-queue';
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

type DriverRoute = {
  _id: string;
  name: string;
  barangay: string;
  schedule: number[];
  stops: RouteStop[];
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

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const MAPBOX_ACCESS_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN?.trim();
const MAP_CENTER: [number, number] = [123.1815, 13.6192];

if (MAPBOX_ACCESS_TOKEN) {
  Mapbox.setAccessToken(MAPBOX_ACCESS_TOKEN);
}

function displayShift(shift?: AccountUser['shift']) {
  return shift === 'night' ? 'Night Shift' : 'Day Shift';
}

function formatTime(date?: string) {
  if (!date) return '—';

  return new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
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
          <Text numberOfLines={1} style={styles.streetSubtitle}>{route?.barangay ? `${route.barangay} · ${stopNames}` : stopNames}</Text>
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
  const [activeTab, setActiveTab] = useState<CollectorTab>('map');
  const [session, setSession] = useState<AuthSession | null>(null);
  const [driver, setDriver] = useState<AccountUser | null>(null);
  const [assignedRoute, setAssignedRoute] = useState<DriverRoute | null>(null);
  const [progress, setProgress] = useState<RouteProgress | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isGeofencingEnabled, setIsGeofencingEnabled] = useState(false);
  const [isUpdatingGeofence, setIsUpdatingGeofence] = useState(false);
  const [geofencingMessage, setGeofencingMessage] = useState<string | null>(null);
  const [pendingRouteLogs, setPendingRouteLogs] = useState(0);
  const [failedRouteLogs, setFailedRouteLogs] = useState(0);

  const loadDriverData = useCallback(async (token: string) => {
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
      } else if (routeResult.response.ok && routePayload.success && routePayload.data) {
        setAssignedRoute(routePayload.data);
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
      setLoadError('Unable to reach the server. Check your connection and refresh.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getSession().then((savedSession) => {
      if (!savedSession) {
        router.replace('/login');
        return;
      }
      if (isMounted) {
        setSession(savedSession);
        void loadDriverData(savedSession.token);
      }
    }).catch(() => router.replace('/login'));
    return () => { isMounted = false; };
  }, [loadDriverData, router]);

  const profile = driver || session?.user || null;
  const collectorName = profile?.name?.trim() || 'Driver';
  const initial = collectorName.charAt(0).toUpperCase();
  const routeStops = assignedRoute?.stops || [];
  const completedStopIds = new Set((progress?.logs || []).filter((log) => log.status === 'collected').map((log) => log.stopId));
  const geofenceStops = useMemo(() => (assignedRoute?.stops || [])
    .filter((stop) => !(progress?.logs || []).some((log) => log.stopId === stop._id && log.status === 'collected'))
    .map((stop) => ({ id: stop._id, latitude: stop.latitude, longitude: stop.longitude })), [assignedRoute, progress]);
  const todayStreets: Street[] = routeStops.map((stop) => {
    const log = progress?.logs.find((item) => item.stopId === stop._id && item.status === 'collected');
    return {
      id: stop._id,
      name: stop.name,
      barangay: assignedRoute?.barangay || '',
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
  const firstStop = routeStops[0];
  const mapCenter: [number, number] = firstStop ? [firstStop.longitude, firstStop.latitude] : MAP_CENTER;
  const barangay = assignedRoute?.barangay || profile?.barangay || profile?.location || 'No route assigned';
  const collectorId = session?.user._id || session?.user.id;

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
      if (result.synced) void loadDriverData(session.token);
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
    if (!API_URL || !assignedRoute) {
      setGeofencingMessage('Load an assigned route before enabling background geofencing.');
      return;
    }
    if (!geofenceStops.length) {
      setGeofencingMessage('All assigned stops are already completed.');
      return;
    }

    setIsUpdatingGeofence(true);
    setGeofencingMessage(null);
    try {
      const result = await enableDriverGeofencing({ apiUrl: API_URL, stops: geofenceStops });
      setIsGeofencingEnabled(result.enabled);
      setGeofencingMessage(result.message);
      if (result.enabled && session?.token && collectorId) {
        applyQueueResult(await syncRouteLogQueue({ apiUrl: API_URL, token: session.token, collectorId }));
      }
    } catch {
      setGeofencingMessage('Unable to enable background geofencing.');
    } finally {
      setIsUpdatingGeofence(false);
    }
  }, [applyQueueResult, assignedRoute, collectorId, geofenceStops, session?.token]);

  const disableBackgroundGeofencing = useCallback(async () => {
    setIsUpdatingGeofence(true);
    try {
      await stopDriverGeofencing({ forgetConfiguration: true });
      setIsGeofencingEnabled(false);
      setGeofencingMessage('Background geofencing is off. Queued route logs will still sync when you reconnect.');
    } catch {
      setGeofencingMessage('Unable to turn off background geofencing.');
    } finally {
      setIsUpdatingGeofence(false);
    }
  }, []);

  const signOut = async () => {
    try {
      await stopDriverGeofencing({ forgetConfiguration: true });
    } finally {
      await clearSession();
      setSession(null);
      router.replace('/login');
    }
  };

  const mapScreen = (
    <View style={styles.mapScreen}>
      <StandardHeader barangay={barangay} hasError={Boolean(loadError)} hasRoute={Boolean(assignedRoute)} isLoading={isLoading} shift={profile?.shift} />
      <View style={styles.mapPlaceholder}>
        {MAPBOX_ACCESS_TOKEN ? (
          <Mapbox.MapView style={styles.mapView} styleURL={Mapbox.StyleURL.Street}>
            <Mapbox.Camera centerCoordinate={mapCenter} zoomLevel={firstStop ? 15 : 12} />
            {routeStops.map((stop) => {
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
                <Feather color={isGeofencingEnabled ? '#07815f' : '#68776e'} name={isGeofencingEnabled ? 'crosshair' : 'map-pin'} size={17} />
                <View style={styles.geofenceTextWrap}>
                  <Text style={styles.geofenceTitle}>{isGeofencingEnabled ? 'Background geofencing on' : 'Background geofencing off'}</Text>
                  <Text numberOfLines={2} style={styles.geofenceCaption}>{geofencingMessage || 'Enter and exit a stop zone to create one offline-safe collection log.'}</Text>
                </View>
              </View>
              <Pressable disabled={isUpdatingGeofence} onPress={() => void (isGeofencingEnabled ? disableBackgroundGeofencing() : enableBackgroundGeofencing())} style={[styles.geofenceButton, isGeofencingEnabled && styles.geofenceButtonEnabled, isUpdatingGeofence && styles.geofenceButtonDisabled]}>
                <Text style={[styles.geofenceButtonText, isGeofencingEnabled && styles.geofenceButtonTextEnabled]}>{isUpdatingGeofence ? 'Working…' : isGeofencingEnabled ? 'Turn off' : 'Enable'}</Text>
              </Pressable>
            </View>
            {pendingRouteLogs > 0 && <Text style={styles.geofenceQueueText}>{pendingRouteLogs} route log{pendingRouteLogs === 1 ? '' : 's'} queued for sync{failedRouteLogs ? ` (${failedRouteLogs} need attention)` : ''}.</Text>}
          </View>
        )}
        <Card style={styles.legendCard}>
          <View style={styles.legendHeading}><Feather color="#d79d2f" name="flag" size={15} /><Text style={styles.legendTitle}>Priority</Text></View>
          {[['#13b981', 'Collected'], ['#9ea7a1', 'Pending'], ['#8d53ce', 'For review']].map(([color, label]) => <View key={label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}
        </Card>
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
          <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
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
      <View style={styles.syncBottomBar}><View style={styles.syncBottomTextWrap}><Feather color={loadError ? '#c05d36' : '#07815f'} name={loadError ? 'alert-circle' : 'wifi'} size={15} /><Text style={styles.syncBottomText}>{loadError || (isLoading ? 'Refreshing driver data…' : 'Driver data is up to date')}</Text></View><Pressable disabled={!session || isLoading} onPress={() => session && void loadDriverData(session.token)} style={[styles.syncButton, (!session || isLoading) && styles.syncButtonDisabled]}><Text style={styles.syncButtonText}>{isLoading ? 'Refreshing' : 'Refresh'}</Text></Pressable></View>
    </View>
  );

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <StatusBar backgroundColor="transparent" style="light" translucent />
      <View style={styles.content}>{activeTab === 'map' ? mapScreen : activeTab === 'history' ? historyScreen : profileScreen}</View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
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
  geofenceQueueText: { color: '#9b6816', fontSize: 9, fontWeight: '700', marginTop: 7 },
  legendCard: { backgroundColor: '#ffffff', borderRadius: 11, padding: 10, position: 'absolute', right: 12, shadowColor: '#234837', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.12, shadowRadius: 8, top: 12, width: 137 },
  legendHeading: { alignItems: 'center', borderBottomColor: '#edf1ef', borderBottomWidth: 1, flexDirection: 'row', gap: 5, paddingBottom: 7 },
  legendTitle: { color: '#99630c', fontSize: 10, fontWeight: '800' },
  legendRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  legendDot: { borderRadius: 5, height: 8, width: 8 },
  legendText: { color: '#5d6d64', fontSize: 10, fontWeight: '600' },
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
