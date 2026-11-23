import { useNetworkRecovery } from '@/hooks/use-network-recovery';
import { useAppTheme } from '@/hooks/app-preferences';
import { requestJson } from '@/lib/network-request';
import { WorkProfileEditor } from '@/components/work-profile-editor';
import { ResidentAvatar } from '@/components/resident-avatar';
import { StaffSearchSelect, StaffHistoryFilters, filterStaffHistory, historyText, validSlope } from '@/components/staff-controls';
import { ProfileSettingsRow } from '@/components/profile-settings-row';
import { MotionPressable as Pressable, TabTransition, useSlidingTabPill, useClosingValue, RevealRow, useFirstLoadReveal, ToastMotion } from '@/components/app-motion';
import { SkeletonBlock, SkeletonRegion, SkeletonRows, useSkeletonVisible } from '@/components/loading-skeleton';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from 'heroui-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text as NativeText,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { type AppSelectOption } from '@/components/app-select';
import { AppText as Text } from '@/components/app-text';
import { BrandMark } from '@/components/brand-mark';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { StaffSubmissionDetails } from '@/components/staff-submission-details';
import { UploadSyncBadge } from '@/components/upload-sync-badge';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearSession, getSession } from '@/lib/session';
import {
  enqueueStaffTruckload,
  getQueuedStaffTruckloads,
  getStaffCache,
  getStaffTruckloadQueueStats,
  saveStaffCache,
  subscribeToStaffTruckloadSync,
  syncStaffTruckloadQueue,
} from '@/lib/staff-truckload-queue';
import {
  clearPendingCameraContext,
  getPendingCameraContext,
  savePendingCameraContext,
} from '@/lib/camera-recovery';
import { optimizeProofPhoto, proofCameraOptions } from '@/lib/proof-photo';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const MAX_AUDIT_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_AUDIT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DENSITY_FACTOR = 0.294;

type Tab = 'input' | 'history' | 'profile';
type Truck = {
  truckNumber?: string;
  plate: string;
  length: string;
  width: string;
  height: string;
};

type TruckResponse = {
  truckNumber?: string;
  plateNumber: string;
  length: number;
  width: number;
  height: number;
};

type AreaOption = {
  _id: string;
  barangay: string | string[];
  name?: string;
};

type AreasResponse = {
  areas?: AreaOption[];
};

type DriversResponse = {
  drivers?: { _id: string; name: string }[];
};

type StaffProfile = {
  _id?: string;
  name?: string;
  email?: string;
  role?: string;
  barangay?: string;
  profilePhotoUrl?: string;
  employeeId?: string;
  contact?: string;
  phone?: string;
  location?: string;
  shift?: string;
};

type TruckLoadResponse = {
  _id?: string;
  clientSubmissionId?: string;
  truckPlate?: string;
  routeId?: { barangay?: string | string[]; name?: string } | null;
  length?: number;
  width?: number;
  height?: number;
  slope?: number;
  measurementMode?: 'three-point' | 'single-pile';
  pileHeightM?: number;
  avgHeightM?: number;
  baseVolumeM3?: number;
  slopeVolumeM3?: number;
  totalVolumeM3?: number;
  pileHeightsCm?: Record<string, number>;
  volumeCubicM?: number;
  tonnesEstimate?: number;
  densityFactor?: number;
  arrivedAt?: string;
  notes?: string;
  photoUrl?: string;
  sidePhotoUrl?: string;
  backPhotoUrl?: string;
  sidePhotoMetadata?: Record<string, unknown>;
  backPhotoMetadata?: Record<string, unknown>;
};

type AuditPhotoSlot = 'side' | 'back';

type AuditPhoto = {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
  width: number;
  height: number;
  capturedAt: string;
  webFile?: unknown;
};

type Submission = {
  id: string;
  barangay: string;
  truckPlate: string;
  driver: string;
  submittedAt: string;
  length: number;
  width: number;
  height: number;
  slope: string;
  measurementMode?: 'three-point' | 'single-pile';
  pileHeightM?: number;
  avgHeightM?: number;
  baseVolumeM3?: number;
  slopeVolumeM3?: number;
  totalVolumeM3?: number;
  pileHeightsCm?: Record<string, number>;
  tonnes: number;
  status: 'Synced' | 'Pending' | 'Failed';
  notes: string;
  photoUrl?: string;
  sidePhotoUrl?: string;
  backPhotoUrl?: string;
};

type TonnagePreview = {
  measurementMode: 'three-point' | 'single-pile';
  avgHeightM?: number;
  baseVolumeM3: number;
  volumeCubicM: number;
  slopeCubicM: number;
  totalVolumeM3: number;
  tonnes: number;
};



const formatTonnage = (tonnes: number) => `${tonnes.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
const formatHistoryNumber = (value: number) => value.toLocaleString('en-PH', {
  ...(value >= 1_000_000 ? { notation: 'compact' as const } : {}),
  maximumFractionDigits: 2,
});
const formatHistoryTonnage = (tonnes: number) => `${formatHistoryNumber(tonnes)} t`;
const formatFileSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;
const areaLabel = (area: AreaOption) => {
  const match = area.name?.match(/\bArea\s+(\d+)([A-Za-z]?)\b/i);
  if (match) return `Area ${match[1]}${match[2].toUpperCase()}`;
  return area.name?.replace(/\s+Collection Route\s*$/i, '').trim() || 'Unnamed area';
};
const compareAreas = (first: AreaOption, second: AreaOption) => {
  const firstLabel = areaLabel(first);
  const secondLabel = areaLabel(second);
  const firstMatch = firstLabel.match(/^Area\s+(\d+)\s*([A-Za-z]*)$/i);
  const secondMatch = secondLabel.match(/^Area\s+(\d+)\s*([A-Za-z]*)$/i);
  if (firstMatch && secondMatch) {
    const numberDifference = Number(firstMatch[1]) - Number(secondMatch[1]);
    if (numberDifference !== 0) return numberDifference;
    return firstMatch[2].localeCompare(secondMatch[2], undefined, { sensitivity: 'base' });
  }
  return firstLabel.localeCompare(secondLabel, undefined, { numeric: true, sensitivity: 'base' });
};
const slopeValue = (selection: string) => {
  const value = Number.parseFloat(selection);
  return Number.isFinite(value) ? value : 0;
};
const calculateBreakdown = (mode: 'three-point' | 'single-pile', length: number, width: number, height: number, pileHeights: Record<string, string>, pileHeightM: string, densityFactor = DENSITY_FACTOR) => {
  if (mode === 'three-point') {
    const avgHeightM = (Number(pileHeights.front) + Number(pileHeights.middle) + Number(pileHeights.back)) / 300;
    const totalVolumeM3 = length * width * avgHeightM;
    return { measurementMode: mode, avgHeightM, baseVolumeM3: 0, volumeCubicM: totalVolumeM3, slopeCubicM: 0, totalVolumeM3, tonnes: totalVolumeM3 * densityFactor };
  }
  const baseVolumeM3 = length * width * height;
  const slopeCubicM = 0.5 * length * width * Number(pileHeightM || 0);
  const totalVolumeM3 = baseVolumeM3 + slopeCubicM;
  return { measurementMode: mode, baseVolumeM3, volumeCubicM: totalVolumeM3, slopeCubicM, totalVolumeM3, tonnes: totalVolumeM3 * densityFactor };
};
const calculateTonnage = (length: number, width: number, height: number, slope: number, densityFactor = DENSITY_FACTOR) => (length * width * height + slope) * densityFactor;
const queueBreakdown = (q: { measurementMode?: 'three-point' | 'single-pile'; pileHeightsCm?: Record<string, number>; pileHeightM?: string; length: string; width: string; height: string; slope: string }) => {
  const mode = q.measurementMode || (q.pileHeightsCm ? 'three-point' : 'single-pile');
  const heights = q.pileHeightsCm ? Object.fromEntries(Object.entries(q.pileHeightsCm).map(([key, value]) => [key, String(value)])) : { front: '0', middle: '0', back: '0' };
  return calculateBreakdown(mode, Number(q.length || 0), Number(q.width || 0), Number(q.height || 0), heights, q.pileHeightM || '0');
};
const formatSlope = (value?: number) => `${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 6 })} m³`;
const formatSubmissionDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
};
const formatRole = (value?: string) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Staff';

function mapTruckLoad(load: TruckLoadResponse, staffName = 'You', fallbackArea = ''): Submission {
  const length = Number(load.length || 0);
  const width = Number(load.width || 0);
  const height = Number(load.height || 0);
  const slope = Number(load.slope || 0);
  const densityFactor = Number(load.densityFactor);
  const effectiveDensity = Number.isFinite(densityFactor) && densityFactor > 0 ? densityFactor : DENSITY_FACTOR;

  // Recalculate from the stored metre dimensions so older records that were
  // saved before the tonnage hook (and therefore have tonnesEstimate = 0)
  // still display the correct value.
  const mode = load.measurementMode || (load.pileHeightsCm ? 'three-point' : 'single-pile');
  const heights = load.pileHeightsCm ? Object.fromEntries(Object.entries(load.pileHeightsCm).map(([key, value]) => [key, String(value)])) : { front: '0', middle: '0', back: '0' };
  const breakdown = calculateBreakdown(mode, length, width, height, heights, String(load.pileHeightM ?? 0), effectiveDensity);
  const calculatedTonnage = load.measurementMode || load.pileHeightsCm ? breakdown.tonnes : calculateTonnage(length, width, height, slope, effectiveDensity);
  return {
    id: load.clientSubmissionId || load._id || `${load.truckPlate || 'load'}-${load.arrivedAt || Date.now()}`,
    barangay: historyText(load.routeId?.barangay) || fallbackArea.split(' · ')[0] || 'No area assigned',
    truckPlate: load.truckPlate || 'Unknown truck',
    driver: staffName,
    submittedAt: formatSubmissionDate(load.arrivedAt),
    length,
    width,
    height,
    slope: formatSlope(slope),
    measurementMode: breakdown.measurementMode,
    pileHeightM: load.pileHeightM,
    avgHeightM: load.avgHeightM ?? breakdown.avgHeightM,
    baseVolumeM3: load.baseVolumeM3 ?? breakdown.baseVolumeM3,
    slopeVolumeM3: load.slopeVolumeM3 ?? breakdown.slopeCubicM,
    totalVolumeM3: load.totalVolumeM3 || breakdown.totalVolumeM3,
    pileHeightsCm: load.pileHeightsCm,
    tonnes: calculatedTonnage,
    status: 'Synced',
    notes: load.notes || '',
    photoUrl: load.photoUrl,
    sidePhotoUrl: load.sidePhotoUrl,
    backPhotoUrl: load.backPhotoUrl,
  };
}

async function getAssetSize(asset: ImagePicker.ImagePickerAsset): Promise<number> {
  if (typeof asset.fileSize === 'number' && asset.fileSize > 0) return asset.fileSize;
  if (asset.uri.startsWith('file://')) {
    const info = await FileSystem.getInfoAsync(asset.uri);
    if (info.exists && 'size' in info && typeof info.size === 'number') return info.size;
    throw new Error('Unable to read the captured photo. Please retake it.');
  }
  try {
    const response = await fetch(asset.uri);
    const blob = await response.blob();
    if (blob.size > 0) return blob.size;
  } catch {
    // On some Android builds, fetching a local file:// URI is blocked.
    // Fall through and return 0 so the upload can still proceed.
  }
  return 0;
}

async function prepareAuditPhoto(asset: ImagePicker.ImagePickerAsset): Promise<AuditPhoto> {
  const optimizedAsset = await optimizeProofPhoto(asset);
  const mimeType = optimizedAsset.mimeType || 'image/jpeg';
  if (!ALLOWED_AUDIT_PHOTO_TYPES.includes(mimeType)) {
    throw new Error('Use a JPEG, PNG, or WebP audit photo.');
  }

  const size = await getAssetSize(optimizedAsset);
  if (size > MAX_AUDIT_PHOTO_SIZE) {
    throw new Error(`The photo is ${formatFileSize(size)}. Retake it at a lower resolution; the 5 MB limit is strict.`);
  }

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return {
    uri: optimizedAsset.uri,
    fileName: optimizedAsset.fileName || `truckload-audit-${Date.now()}.${extension}`,
    mimeType,
    size,
    width: optimizedAsset.width,
    height: optimizedAsset.height,
    capturedAt: new Date().toISOString(),
    webFile: optimizedAsset.file,
  };
}

function appendAuditPhoto(formData: FormData, fieldName: string, photo: AuditPhoto) {
  if (photo.webFile) {
    formData.append(fieldName, photo.webFile as Blob);
    return;
  }

  formData.append(fieldName, {
    uri: photo.uri,
    name: photo.fileName,
    type: photo.mimeType,
  } as unknown as Blob);
}

function auditPhotoMetadata(photo: AuditPhoto) {
  return JSON.stringify({
    capturedAt: photo.capturedAt,
    width: photo.width,
    height: photo.height,
    fileSize: photo.size,
    mimeType: photo.mimeType,
  });
}

function AuditPhotoField({ disabled, label, loading, onPress, photo }: { disabled: boolean; label: string; loading?: boolean; onPress: () => void; photo: AuditPhoto | null }) {
  const isDarkTheme = useAppTheme() === 'dark';
  return (
    <View style={styles.photoSlot}>
      <Pressable
        accessibilityLabel={`${label} proof photo`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={[styles.photoField, isDarkTheme && { backgroundColor: '#192A22', borderColor: '#2D4438' }, photo && styles.photoFieldAttached, disabled && styles.photoFieldDisabled]}>
        {photo ? (
          <ExpoImage
            accessibilityLabel={`${label} proof photo attached`}
            contentFit="contain"
            source={{ uri: photo.uri }}
            style={styles.photoPreview}
            transition={150}
          />
        ) : null}
        <View style={[styles.photoOverlay, photo && styles.photoOverlayAttached]}>
          <View style={[styles.cameraBadge, isDarkTheme && { backgroundColor: '#21372C' }, photo && styles.cameraBadgeAttached, loading && styles.cameraBadgeLoading]}>
            {loading
              ? <ActivityIndicator color="#07815f" size="small" />
              : <Feather color={photo ? '#ffffff' : '#07815f'} name={photo ? 'check' : 'camera'} size={21} />}
          </View>
          <Text style={[styles.photoTitle, isDarkTheme && { color: '#F1F6F3' }, photo && styles.photoOverlayTitle]}>
            {loading ? `Opening camera...` : photo ? `${label} photo attached` : `Capture ${label} photo`}
          </Text>
          <Text style={[styles.photoCaption, isDarkTheme && { color: '#B4C4BB' }, photo && styles.photoCaptionAttached]}>{photo ? `${formatFileSize(photo.size)} · Ready` : 'JPEG, PNG or WebP · 5 MB max'}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function SelectField({ disabled = false, loading = false, error, icon, label, onChange, options, placeholder, value }: { disabled?: boolean; loading?: boolean; error?: string; icon: 'truck' | 'map-pin' | 'user' | 'trending-up'; label: string; onChange: (value: string) => void; options: AppSelectOption[]; placeholder: string; value: string }) {
  const isDarkTheme = useAppTheme() === 'dark';
  const skeleton = useSkeletonVisible(loading, options.length > 0, error);
  return <SkeletonRegion state={skeleton} placeholder={<View style={styles.selectSkeleton}><Text style={[styles.measurementLabel, isDarkTheme && { color: '#B4C4BB' }]}>{label}</Text><SkeletonBlock height={56} radius={16} /></View>}><StaffSearchSelect disabled={disabled} leadingIcon={icon} label={label} onChange={onChange} options={options} placeholder={placeholder} value={value} /></SkeletonRegion>;
}

function MeasurementField({ label, value }: { label: string; value: string }) {
  const isDarkTheme = useAppTheme() === 'dark';
  return (
    <View style={styles.measurementField}>
      <Text style={[styles.measurementLabel, isDarkTheme && { color: '#B4C4BB' }]}>{label}</Text>
      <View style={[styles.measurementInputWrap, isDarkTheme && { backgroundColor: '#192A22' }]}>
        <Feather color={isDarkTheme ? '#85DCB0' : '#95a49d'} name="lock" size={12} />
        <Text accessibilityLabel={`${label}, locked`} style={[styles.measurementValue, isDarkTheme && { color: '#F1F6F3' }]}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const appTheme = useAppTheme();
  const isDark = appTheme === 'dark';
  const pill = useSlidingTabPill(activeTab);
  const items: { key: Tab; label: string; icon: 'clipboard' | 'activity' | 'user' }[] = [
    { key: 'input', label: 'Input', icon: 'clipboard' },
    { key: 'history', label: 'History', icon: 'activity' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <View style={[styles.bottomNav, isDark && { backgroundColor: '#0D1914', borderTopColor: '#203228' }, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {pill.indicator}
      {items.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable
            motionDisabled
            onLayout={(event) => pill.itemLayout(item.key, event)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={styles.navItem}>
            <View onLayout={(event) => pill.iconLayout(item.key, event)} collapsable={false} style={styles.navIcon}>
              <Feather color={active ? '#086B42' : '#5A6761'} name={item.icon} size={21} />
            </View>
            <Text style={[styles.navLabel, isDark && { color: '#B4C4BB' }, active && (isDark ? { color: '#85DCB0' } : styles.navLabelActive)]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function StaffScreen() {
  const appTheme = useAppTheme();
  const isDarkTheme = appTheme === 'dark';
  const networkRevision = useNetworkRecovery();
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  const cameraBusyRef = useRef(false);
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [isOffline, setIsOffline] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [isLoadingTrucks, setIsLoadingTrucks] = useState(false);
  const [truckLoadError, setTruckLoadError] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(false);
  const [areaLoadError, setAreaLoadError] = useState('');
  const [area, setArea] = useState('');
  const [routeId, setRouteId] = useState('');
  const [drivers, setDrivers] = useState<string[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);
  const [driverLoadError, setDriverLoadError] = useState('');
  const [driver, setDriver] = useState('');
  const [measurementMode, setMeasurementMode] = useState<'three-point' | 'single-pile'>('three-point');
  const [pileHeights, setPileHeights] = useState({ front: '', middle: '', back: '' });
  const [pileHeightM, setPileHeightM] = useState('0');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const validPileHeights = Object.values(pileHeights).every(value => value.trim() !== '' && validSlope(value));
  const validSinglePile = pileHeightM.trim() !== '' && validSlope(pileHeightM);
  const slope = measurementMode === 'single-pile' ? pileHeightM : (validPileHeights ? '0' : '');

  const [sidePhoto, setSidePhoto] = useState<AuditPhoto | null>(null);
  const [backPhoto, setBackPhoto] = useState<AuditPhoto | null>(null);
  const [isOpeningAuditCamera, setIsOpeningAuditCamera] = useState(false);
  const [openingSlot, setOpeningSlot] = useState<AuditPhotoSlot | null>(null);
  const [tonnagePreview, setTonnagePreview] = useState<TonnagePreview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const closingSubmission = useClosingValue(selectedSubmission);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [editingProfile, setEditingProfile] = useState(false);
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);
  const historySkeleton = useSkeletonVisible(historyLoading, history.length > 0, historyError);
  const profileSkeleton = useSkeletonVisible(profileLoading, Boolean(profile), profileError);
  const revealHistory = useFirstLoadReveal(historyLoading, history.length > 0, historySkeleton.pending);

  // Monitor network connection state
  useEffect(() => {
    let cancelled = false;
    const updateNetStatus = (state: any) => {
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

  // 1. Trucks: SQLite cache first, then server fetch
  useEffect(() => {
    let cancelled = false;

    const loadTrucks = async () => {
      const cached = await getStaffCache<Truck[]>('trucks');
      if (cached && cached.length > 0 && !cancelled) {
        setTrucks(cached);
        setTruckPlate((cur) => cur || cached[0].plate);
        setLength((cur) => cur || cached[0].length);
        setWidth((cur) => cur || cached[0].width);
        setHeight((cur) => cur || cached[0].height);
      }

      if (!API_URL) return;

      try {
        const session = await getSession();
        if (!session?.token) return;

        const { response, payload: result } = await requestJson(`${API_URL}/trucks`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (response.ok && result.success && Array.isArray(result.data?.trucks)) {
          const registeredTrucks = ((result.data?.trucks || []) as TruckResponse[]).map((truck) => ({
            plate: truck.plateNumber,
            truckNumber: truck.truckNumber,
            length: String(truck.length),
            width: String(truck.width),
            height: String(truck.height),
          }));

          if (registeredTrucks.length > 0 && !cancelled) {
            setTrucks(registeredTrucks);
            const first = registeredTrucks[0];
            setTruckPlate((cur) => cur || first.plate);
            setLength((cur) => cur || first.length);
            setWidth((cur) => cur || first.width);
            setHeight((cur) => cur || first.height);
            setTruckLoadError('');
            void saveStaffCache('trucks', registeredTrucks);
          }
        }
      } catch {
        if (!cancelled) setIsOffline(true);
      }
    };

    void loadTrucks();
    return () => { cancelled = true; };
  }, [networkRevision]);

  // 2. Areas: SQLite cache first, then server fetch
  useEffect(() => {
    let cancelled = false;

    const loadAreas = async () => {
      const cached = await getStaffCache<AreaOption[]>('areas');
      if (cached && cached.length > 0 && !cancelled) {
        setAreas(cached);
        setArea((cur) => cur || (cached[0] ? areaLabel(cached[0]) : ''));
        setRouteId((cur) => cur || cached[0]?._id || '');
      }

      if (!API_URL) return;

      try {
        const session = await getSession();
        if (!session?.token) return;

        const { response, payload: result } = await requestJson(`${API_URL}/staff/areas`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (response.ok && result.success) {
          const availableAreas = [...(((result.data || {}) as AreasResponse).areas || [])]
            .filter((item) => item?._id && item.barangay)
            .sort(compareAreas);

          if (availableAreas.length > 0 && !cancelled) {
            setAreas(availableAreas);
            setArea((cur) => cur || (availableAreas[0] ? areaLabel(availableAreas[0]) : ''));
            setRouteId((cur) => cur || availableAreas[0]?._id || '');
            setAreaLoadError('');
            void saveStaffCache('areas', availableAreas);
          }
        }
      } catch {
        if (!cancelled) setIsOffline(true);
      }
    };

    void loadAreas();
    return () => { cancelled = true; };
  }, [networkRevision]);

  // 3. Drivers: SQLite cache first, then server fetch
  useEffect(() => {
    let cancelled = false;

    const loadDrivers = async () => {
      const cached = await getStaffCache<string[]>('drivers');
      if (cached && cached.length > 0 && !cancelled) {
        setDrivers(cached);
        setDriver((cur) => cur || cached[0]);
      }

      if (!API_URL) return;

      try {
        const session = await getSession();
        if (!session?.token) return;

        const { response, payload: result } = await requestJson(`${API_URL}/staff/drivers`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (response.ok && result.success) {
          const availableDrivers = [...(((result.data || {}) as DriversResponse).drivers || [])]
            .map((item) => item.name)
            .filter(Boolean)
            .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));

          if (availableDrivers.length > 0 && !cancelled) {
            setDrivers(availableDrivers);
            setDriver((cur) => cur || availableDrivers[0] || '');
            setDriverLoadError('');
            void saveStaffCache('drivers', availableDrivers);
          }
        }
      } catch {
        if (!cancelled) setIsOffline(true);
      }
    };

    void loadDrivers();
    return () => { cancelled = true; };
  }, [networkRevision]);

  // Helper to refresh history and merge with pending offline queue
  const refreshHistory = async (token: string, staffName: string) => {
    const session = await getSession();
    const staffId = session?.user?._id || session?.user?.id;

    const queuedRows = staffId ? await getQueuedStaffTruckloads(staffId) : [];
    const queuedSubmissions: Submission[] = queuedRows.map((q) => {
      const len = Number(q.length || 0);
      const wid = Number(q.width || 0);
      const hgt = Number(q.height || 0);
      const qBreakdown = queueBreakdown(q);
      const slp = qBreakdown.slopeCubicM;
      return {
        id: q.clientId,
        barangay: q.area || 'Offline submission',
        truckPlate: q.truckPlate,
        driver: q.driver || staffName,
        submittedAt: formatSubmissionDate(q.createdAt),
        length: len,
        width: wid,
        height: hgt,
        slope: formatSlope(slp),
        pileHeightsCm: q.pileHeightsCm,
        measurementMode: qBreakdown.measurementMode,
        avgHeightM: qBreakdown.avgHeightM,
        baseVolumeM3: qBreakdown.baseVolumeM3,
        slopeVolumeM3: qBreakdown.slopeCubicM,
        totalVolumeM3: qBreakdown.totalVolumeM3,
        tonnes: qBreakdown.tonnes,
        status: q.lastError ? 'Failed' : 'Pending',
        notes: q.notes,
        sidePhotoUrl: q.sidePhotoUri,
        backPhotoUrl: q.backPhotoUri,
      };
    });

    if (!API_URL) {
      if (queuedSubmissions.length) setHistory(queuedSubmissions);
      return;
    }

    try {
      const { response, payload: result } = await requestJson(`${API_URL}/staff/truckloads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok && result.success) {
        const loads = (result.data?.loads || []) as TruckLoadResponse[];
        const mappedServer = loads.map((load) => mapTruckLoad(load, staffName));
        const combined = [...queuedSubmissions, ...mappedServer];
        const seen = new Set<string>();
        const deduped = combined.filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });

        setHistory(deduped);
        if (staffId) void saveStaffCache(`history:${staffId}`, mappedServer);
        setHistoryError('');
        setHistoryLoading(false);
      }
    } catch {
      const cached = staffId ? await getStaffCache<Submission[]>(`history:${staffId}`) : [];
      const combined = [...queuedSubmissions, ...(cached || [])];
      const seen = new Set<string>();
      const deduped = combined.filter((item) => {
        if (seen.has(item.id)) return false;
        seen.add(item.id);
        return true;
      });
      setHistory(deduped);
      setHistoryLoading(false);
    }
  };

  // 4. Background queue sync subscription
  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const setupQueueSync = async () => {
      const session = await getSession();
      const staffId = session?.user?._id || session?.user?.id;
      if (!session?.token || !staffId) return;

      const stats = await getStaffTruckloadQueueStats(staffId);
      if (!cancelled) setPendingSync(stats.pending);

      if (!API_URL) return;
      const context = { apiUrl: API_URL, token: session.token, staffId };

      unsubscribe = subscribeToStaffTruckloadSync(context, async (result) => {
        if (cancelled) return;
        setPendingSync(result.pending);
        if (result.synced > 0) {
          setMessage(`Synced ${result.synced} offline measurement${result.synced > 1 ? 's' : ''} to server.`);
        }
        if (result.synced > 0 || result.failed > 0) await refreshHistory(session.token, session.user.name || profile?.name || 'You');
      }, syncing => { if (!cancelled) setIsSyncing(syncing); });
    };

    void setupQueueSync().catch(() => {});

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [profile?.name]);

  // 5. Staff profile & history: cache & queue first, then server fetch
  useEffect(() => {
    let cancelled = false;

    const loadStaffData = async () => {
      const session = await getSession();
      const staffId = session?.user?._id || session?.user?.id;
      const staffName = session?.user?.name || 'You';

      if (staffId) {
        const cachedProfile = await getStaffCache<StaffProfile>(`profile:${staffId}`);
        if (cachedProfile && !cancelled) {
          setProfile(cachedProfile);
          setProfileLoading(false);
          setProfileError('');
        } else if (session?.user && !cancelled) {
          setProfile({
            _id: staffId,
            name: session.user.name,
            email: session.user.email,
            role: session.user.role,
            barangay: session.user.barangay,
          });
          setProfileLoading(false);
        }
      }

      if (staffId) {
        const [cachedHistory, queuedRows] = await Promise.all([
          getStaffCache<Submission[]>(`history:${staffId}`),
          getQueuedStaffTruckloads(staffId),
        ]);

        const queuedSubmissions: Submission[] = (queuedRows || []).map((q) => {
          const len = Number(q.length || 0);
          const wid = Number(q.width || 0);
          const hgt = Number(q.height || 0);
          const slp = Number(q.slope || 0);
          return {
            id: q.clientId,
            barangay: q.area || 'Offline submission',
            truckPlate: q.truckPlate,
            driver: q.driver || staffName,
            submittedAt: formatSubmissionDate(q.createdAt),
            length: len,
            width: wid,
            height: hgt,
            slope: formatSlope(slp),
        pileHeightsCm: q.pileHeightsCm,
            tonnes: calculateTonnage(len, wid, hgt, slp),
            status: q.lastError ? 'Failed' : 'Pending',
            notes: q.notes,
            sidePhotoUrl: q.sidePhotoUri,
            backPhotoUrl: q.backPhotoUri,
          };
        });

        const merged = [...queuedSubmissions, ...(cachedHistory || [])];
        if (merged.length > 0 && !cancelled) {
          const seen = new Set<string>();
          const deduped = merged.filter((item) => {
            if (seen.has(item.id)) return false;
            seen.add(item.id);
            return true;
          });
          setHistory(deduped);
          setHistoryLoading(false);
          setHistoryError('');
        }
      }

      if (!API_URL || !session?.token) {
        if (!cancelled) {
          setProfileLoading(false);
          setHistoryLoading(false);
        }
        return;
      }

      try {
        const headers = { Authorization: `Bearer ${session.token}` };
        const [{ response: profileResponse, payload: profileResult }, { response: historyResponse, payload: historyResult }] = await Promise.all([
          requestJson(`${API_URL}/auth/me`, { headers }),
          requestJson(`${API_URL}/staff/truckloads`, { headers }),
        ]);

        if (!cancelled) {
          setIsOffline(false);
          if (profileResponse.ok && profileResult.success && profileResult.data) {
            setProfile(profileResult.data);
            if (staffId) void saveStaffCache(`profile:${staffId}`, profileResult.data);
            setProfileError('');
          }

          if (historyResponse.ok && historyResult.success && historyResult.data) {
            const loads = (historyResult.data?.loads || []) as TruckLoadResponse[];
            const mappedLoads = loads.map((load) => mapTruckLoad(load, profileResult.data?.name || staffName));

            const queuedRows = staffId ? await getQueuedStaffTruckloads(staffId) : [];
            const queuedSubmissions: Submission[] = (queuedRows || []).map((q) => {
              const len = Number(q.length || 0);
              const wid = Number(q.width || 0);
              const hgt = Number(q.height || 0);
              const slp = Number(q.slope || 0);
              return {
                id: q.clientId,
                barangay: q.area || 'Offline submission',
                truckPlate: q.truckPlate,
                driver: q.driver || staffName,
                submittedAt: formatSubmissionDate(q.createdAt),
                length: len,
                width: wid,
                height: hgt,
                slope: formatSlope(slp),
        pileHeightsCm: q.pileHeightsCm,
                tonnes: calculateTonnage(len, wid, hgt, slp),
                status: q.lastError ? 'Failed' : 'Pending',
                notes: q.notes,
                sidePhotoUrl: q.sidePhotoUri,
                backPhotoUrl: q.backPhotoUri,
              };
            });

            const combined = [...queuedSubmissions, ...mappedLoads];
            const seen = new Set<string>();
            const deduped = combined.filter((item) => {
              if (seen.has(item.id)) return false;
              seen.add(item.id);
              return true;
            });

            setHistory(deduped);
            if (staffId) void saveStaffCache(`history:${staffId}`, mappedLoads);
            setHistoryError('');
          }
        }
      } catch {
        if (!cancelled) setIsOffline(true);
      } finally {
        if (!cancelled) {
          setProfileLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    void loadStaffData();
    return () => { cancelled = true; };
  }, [networkRevision]);

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    try {
      const session = await getSession();
      const staffId = session?.user?._id || session?.user?.id;
      if (!API_URL || !session?.token || !staffId) {
        setMessage('Sign in again before syncing.');
        return;
      }
      const net = await NetInfo.fetch();
      if (!net.isConnected || net.isInternetReachable === false) {
        setMessage('Still offline. Please check your internet connection.');
        return;
      }
      const result = await syncStaffTruckloadQueue({ apiUrl: API_URL, token: session.token, staffId });
      setPendingSync(result.pending);
      if (result.synced > 0) {
        setMessage(`Synced ${result.synced} measurement${result.synced > 1 ? 's' : ''} successfully!`);
        await refreshHistory(session.token, profile?.name || session.user.name || 'You');
      } else if (result.pending > 0) {
        setMessage(`Could not sync ${result.pending} item(s). Check connection or server status.`);
        await refreshHistory(session.token, profile?.name || 'You');
      } else {
        setMessage('All measurements are up to date.');
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed. Check connection.');
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const restorePendingCameraResult = async () => {
      if (cameraBusyRef.current) return;
      cameraBusyRef.current = true;
      setIsOpeningAuditCamera(true);
      try {
        const savedContext = await getPendingCameraContext();
        if (cancelled || savedContext?.type !== 'staff') return;
        if (savedContext?.type === 'staff') {
          if (savedContext.truckPlate) setTruckPlate(savedContext.truckPlate);
          if (savedContext.area) setArea(savedContext.area);
          if (savedContext.routeId) setRouteId(savedContext.routeId);
          if (savedContext.driver) setDriver(savedContext.driver);
          if (savedContext.pileHeights) setPileHeights(savedContext.pileHeights);
          if (savedContext.length) setLength(savedContext.length);
          if (savedContext.width) setWidth(savedContext.width);
          if (savedContext.height) setHeight(savedContext.height);
          if (savedContext.notes) setNotes(savedContext.notes);
          if (savedContext.existingSidePhoto) setSidePhoto(savedContext.existingSidePhoto);
          if (savedContext.existingBackPhoto) setBackPhoto(savedContext.existingBackPhoto);
        }

        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (cancelled) return;

        if (!pendingResult || 'code' in pendingResult || pendingResult.canceled || !pendingResult.assets?.length) {
          if (pendingResult && 'code' in pendingResult) {
            throw new Error(pendingResult.message || 'The camera could not recover the photo. Please retake it.');
          }
          if (pendingResult && 'canceled' in pendingResult && pendingResult.canceled) {
            await clearPendingCameraContext();
          }
          return;
        }

        const photo = await prepareAuditPhoto(pendingResult.assets[0]);
        if (!cancelled) {
          const targetSlot = savedContext?.type === 'staff' ? savedContext.slot : (!sidePhoto ? 'side' : 'back');
          if (targetSlot === 'side') {
            setSidePhoto(photo);
            setMessage(`Side photo recovered after returning from the camera (${formatFileSize(photo.size)}).`);
          } else {
            setBackPhoto(photo);
            setMessage(`Back photo recovered after returning from the camera (${formatFileSize(photo.size)}).`);
          }
          await clearPendingCameraContext();
        }
      } catch (error) {
        await clearPendingCameraContext();
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'The camera returned, but the photo could not be recovered.');
        }
      } finally {
        cameraBusyRef.current = false;
        if (!cancelled) setIsOpeningAuditCamera(false);
      }
    };

    // Let a StrictMode effect replay cancel its first setup before claiming the
    // camera lock or consuming Android's one-shot pending result.
    void Promise.resolve().then(() => {
      if (!cancelled) return restorePendingCameraResult();
    });
    return () => { cancelled = true; };
  }, []);

  const [historyFilters, setHistoryFilters] = useState(['', '', '', '', '']);
  const visibleHistory = useMemo(() => filterStaffHistory(history, historyFilters[0], historyFilters[1], historyFilters[2], historyFilters[3], historyFilters[4]), [history, historyFilters]);
  const selectedTruck = trucks.find((truck) => truck.plate === truckPlate);

  const previewTonnage = () => {
    if ((measurementMode === 'three-point' && !validPileHeights) || (measurementMode === 'single-pile' && !validSinglePile)) { setMessage(measurementMode === 'three-point' ? 'Enter front, middle, and back heights in cm (0 or more).' : 'Enter a non-negative pile height in metres.'); setTonnagePreview(null); return; }
    const numericLength = Number(length);
    const numericWidth = Number(width);
    const numericHeight = Number(height);

    if (!Number.isFinite(numericLength) || !Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)
      || numericLength <= 0 || numericWidth <= 0 || numericHeight <= 0) {
      setTonnagePreview(null);
      setMessage('Select a truck with complete registered dimensions before calculating tonnage.');
      return;
    }

    setTonnagePreview(calculateBreakdown(measurementMode, numericLength, numericWidth, numericHeight, pileHeights, pileHeightM));
    setMessage('');
  };

  const completeSignOut = async () => {
    await clearSession();
    router.replace('/login');
  };

  const signOut = () => setIsSignOutConfirmVisible(true);

  const captureAuditPhoto = async (slot: AuditPhotoSlot) => {
    if (isSubmitting || cameraBusyRef.current) return;
    // Lock synchronously, before permissions or state updates can yield to another tap.
    cameraBusyRef.current = true;
    setIsOpeningAuditCamera(true);
    setOpeningSlot(slot);

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Camera permission is required to capture the audit photo.');
        return;
      }

      // Persist the entire form and already taken photos before opening the native camera activity.
      // If the Android OS terminates MainActivity to free memory for the camera, the data can be fully restored upon return.
      await savePendingCameraContext({
        type: 'staff',
        slot,
        truckPlate,
        area,
        routeId,
        driver,
        slope,
        pileHeights,
        length,
        width,
        height,
        notes,
        existingSidePhoto: sidePhoto,
        existingBackPhoto: backPhoto,
      });

      const result = await ImagePicker.launchCameraAsync(proofCameraOptions);
      if (result.canceled || !result.assets?.[0]?.uri) {
        await clearPendingCameraContext();
        return;
      }

      const photo = await prepareAuditPhoto(result.assets[0]);
      if (slot === 'side') setSidePhoto(photo);
      else setBackPhoto(photo);
      await clearPendingCameraContext();
      setMessage(`${slot === 'side' ? 'Side' : 'Back'} photo attached (${formatFileSize(photo.size)}).`);
    } catch (error) {
      await clearPendingCameraContext();
      setMessage(error instanceof Error ? error.message : 'Unable to capture the audit photo.');
    } finally {
      cameraBusyRef.current = false;
      setIsOpeningAuditCamera(false);
      setOpeningSlot(null);
    }
  };

  const submitMeasurement = async () => {
    if ((measurementMode === 'three-point' && !validPileHeights) || (measurementMode === 'single-pile' && !validSinglePile)) { setMessage(measurementMode === 'three-point' ? 'Enter front, middle, and back heights in cm (0 or more).' : 'Enter a non-negative pile height in metres.'); setTonnagePreview(null); return; }
    const numericLength = Number(length);
    const numericWidth = Number(width);
    const numericHeight = Number(height);

    if (!truckPlate) {
      setMessage('Select a registered truck before submitting.');
      return;
    }

    if (!routeId) {
      setMessage('Select an active area before submitting.');
      return;
    }


    if (!numericLength || !numericWidth || !numericHeight) {
      setMessage('The selected truck has incomplete registered dimensions.');
      return;
    }
    const breakdown = calculateBreakdown(measurementMode, numericLength, numericWidth, numericHeight, pileHeights, pileHeightM);

    if (!API_URL) {
      setMessage('EXPO_PUBLIC_API_URL is not configured.');
      return;
    }

    setIsSubmitting(true);
    try {
      const session = await getSession();
      if (!session?.token) throw new Error('Sign in again before submitting this truckload.');

      const staffId = session.user._id || session.user.id;
      if (!staffId) throw new Error('Your staff account is missing an ID. Sign in again before submitting.');

      const clientSubmissionId = Crypto.randomUUID();
      const queueSubmission = async (notice: string) => {
        await enqueueStaffTruckload({
          clientSubmissionId,
          staffId,
          truckPlate,
          routeId,
          area,
          driver,
          length,
          width,
          height,
          measurementMode,
          pileHeightM,
          slope: String(breakdown.slopeCubicM),
          pileHeightsCm: measurementMode === 'three-point' ? Object.fromEntries(Object.entries(pileHeights).map(([key, value]) => [key, Number(value)])) : undefined,
          totalVolumeM3: breakdown.totalVolumeM3,
          tonnes: breakdown.tonnes,
          notes: notes.trim(),
          sidePhoto,
          backPhoto,
        });
        const queueStats = await getStaffTruckloadQueueStats(staffId);
        const pendingSubmission: Submission = {
          id: clientSubmissionId,
          barangay: area || 'Offline Area',
          truckPlate,
          driver: driver || profile?.name || 'You',
          submittedAt: formatSubmissionDate(new Date().toISOString()),
          length: numericLength,
          width: numericWidth,
          height: numericHeight,
          slope: formatSlope(breakdown.slopeCubicM),
          measurementMode,
          pileHeightM: Number(pileHeightM),
          pileHeightsCm: measurementMode === 'three-point' ? Object.fromEntries(Object.entries(pileHeights).map(([key, value]) => [key, Number(value)])) : undefined,
          avgHeightM: breakdown.avgHeightM,
          baseVolumeM3: breakdown.baseVolumeM3,
          slopeVolumeM3: breakdown.slopeCubicM,
          totalVolumeM3: breakdown.totalVolumeM3,
          tonnes: breakdown.tonnes,
          status: 'Pending',
          notes: notes.trim(),
          sidePhotoUrl: sidePhoto?.uri,
          backPhotoUrl: backPhoto?.uri,
        };
        setHistory((current) => [pendingSubmission, ...current.filter((item) => item.id !== clientSubmissionId)]);
        setPendingSync(queueStats.pending);
        setHistoryError('');
        setHistoryLoading(false);
        setSidePhoto(null);
        setBackPhoto(null);
        setNotes('');
        setMessage(notice);
        setActiveTab('history');
      };

      const network = await NetInfo.fetch();
      if (!network.isConnected || network.isInternetReachable === false) {
        await queueSubmission('No connection. Measurement saved locally and will sync automatically.');
        return;
      }

      const formData = new FormData();
      formData.append('clientSubmissionId', clientSubmissionId);
      formData.append('truckPlate', truckPlate);
      if (routeId) formData.append('routeId', routeId);
      if (area) formData.append('area', area);
      if (driver) formData.append('driver', driver);
      // Keep the exact dimensions registered by the admin. Truck dimensions are metres.
      formData.append('length', length);
      formData.append('width', width);
      formData.append('height', height);
      formData.append('measurementMode', measurementMode);
      formData.append('pileHeightM', pileHeightM);
      formData.append('slope', String(breakdown.slopeCubicM));
      if (measurementMode === 'three-point') formData.append('pileHeightsCm', JSON.stringify(Object.fromEntries(Object.entries(pileHeights).map(([key, value]) => [key, Number(value)]))));
      formData.append('notes', notes.trim());

      if (sidePhoto) {
        appendAuditPhoto(formData, 'sidePhoto', sidePhoto);
        formData.append('sidePhotoMetadata', auditPhotoMetadata(sidePhoto));
      }
      if (backPhoto) {
        appendAuditPhoto(formData, 'backPhoto', backPhoto);
        formData.append('backPhotoMetadata', auditPhotoMetadata(backPhoto));
      }

      let response: Response;
      let result: { success?: boolean; error?: string; data?: TruckLoadResponse };
      try {
        ({ response, payload: result } = await requestJson(`${API_URL}/staff/truckloads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          body: formData,
        }, 45000));
      } catch {
        await queueSubmission('Connection lost. Measurement saved locally and will sync automatically.');
        return;
      }
      if (!response.ok || !result.success) {
        if (response.status >= 500) {
          await queueSubmission('Server unavailable. Measurement saved locally and will sync automatically.');
          return;
        }
        throw new Error(result.error || 'Unable to submit the truckload.');
      }

      const savedLoad = result.data as TruckLoadResponse;
      setHistory((current) => [mapTruckLoad(savedLoad, profile?.name || 'You', area), ...current]);
      setHistoryError('');
      setHistoryLoading(false);
      setSidePhoto(null);
      setBackPhoto(null);
      setNotes('');
      setMessage('Measurement saved and audit photo uploaded to Cloudinary.');
      setActiveTab('history');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to submit the truckload.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderInput = () => (
    <ScrollView contentContainerStyle={styles.inputScrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
      <Text style={[styles.inputEyebrow, isDarkTheme && { color: '#85DCB0' }]}>NEW MEASUREMENT</Text>
      <Text style={[styles.inputTitle, isDarkTheme && { color: '#F1F6F3' }]}>Volumetric Input</Text>
      {isOffline && (
        <View style={styles.offlineBanner}>
          <Feather color="#5C3B00" name="wifi-off" size={18} />
          <Text style={styles.offlineBannerText}>
            Offline Mode · Measurements are stored locally and will sync when internet returns
          </Text>
        </View>
      )}
      {pendingSync > 0 && <View style={styles.syncRow}>
          <Pressable
            accessibilityLabel={`Sync ${pendingSync} pending measurements`}
            accessibilityRole="button"
            disabled={isSyncing}
            onPress={handleManualSync}
            style={styles.syncBadge}>
            {isSyncing ? (
              <ActivityIndicator color="#e2c84b" size="small" />
            ) : (
              <MaterialCommunityIcons color="#e2c84b" name="sync" size={15} />
            )}
            <Text style={styles.syncText}>
              {isSyncing ? 'Syncing…' : `${pendingSync} pending sync · Tap to sync`}
            </Text>
          </Pressable>
      </View>}
      <View>
        <Text style={[styles.formSectionTitle, isDarkTheme && { color: '#F1F6F3' }]}>Load details</Text>
        <SelectField
          loading={isLoadingTrucks}
          error={truckLoadError}
          disabled={isLoadingTrucks || trucks.length === 0}
          label="Truck"
          icon="truck"
          onChange={(option) => {
            const truck = trucks.find((item) => item.plate === option);
            if (truck) {
              setTruckPlate(truck.plate);
              setLength(truck.length);
              setWidth(truck.width);
              setHeight(truck.height);
              setTonnagePreview(null);
            }
          }}
          options={trucks.map((truck) => ({ label: truck.truckNumber ? `Truck ${truck.truckNumber}` : 'Truck number not registered', value: truck.plate }))}
          placeholder={isLoadingTrucks ? 'Loading registered trucks…' : trucks.length ? 'Select truck' : 'No registered trucks available'}
          value={truckPlate}
        />
        {truckLoadError && trucks.length === 0 ? <Text style={styles.truckLoadError}>{truckLoadError}</Text> : null}
        <SelectField
          loading={isLoadingAreas}
          error={areaLoadError}
          disabled={isLoadingAreas || areas.length === 0}
          label="Area"
          icon="map-pin"
          onChange={(option) => {
            const selectedArea = areas.find((item) => areaLabel(item) === option);
            setArea(option);
            setRouteId(selectedArea?._id || '');
          }}
          options={areas.map((item) => ({ label: areaLabel(item), description: historyText(item.barangay), value: areaLabel(item) }))}
          placeholder={isLoadingAreas ? 'Loading areas…' : areas.length ? 'Select area' : 'No areas available'}
          value={area}
        />
        {areaLoadError && areas.length === 0 ? <Text style={styles.truckLoadError}>{areaLoadError}</Text> : null}
        <SelectField
          loading={isLoadingDrivers}
          error={driverLoadError}
          disabled={isLoadingDrivers || drivers.length === 0}
          label="Driver"
          icon="user"
          onChange={setDriver}
          options={drivers.map((item) => ({ label: item, value: item }))}
          placeholder={isLoadingDrivers ? 'Loading drivers…' : drivers.length ? 'Select driver' : 'No drivers available'}
          value={driver}
        />
        {driverLoadError && drivers.length === 0 ? <Text style={styles.truckLoadError}>{driverLoadError}</Text> : null}

        <Text style={[styles.formSectionTitle, styles.sectionSpacing, isDarkTheme && { color: '#F1F6F3' }]}>Height of pile</Text>
        <View style={[styles.modeSelector, isDarkTheme && { backgroundColor: '#192A22' }]}>
          {([['three-point', '3-Point Height (cm)'], ['single-pile', 'Single Pile Height (m)']] as const).map(([mode, label]) => (
            <Pressable key={mode} onPress={() => { setMeasurementMode(mode); setTonnagePreview(null); }} style={[styles.modeOption, measurementMode === mode && styles.modeOptionSelected]}>
              <Text style={[styles.modeOptionText, isDarkTheme && { color: '#B4C4BB' }, measurementMode === mode && styles.modeOptionTextSelected]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={[styles.helperText, isDarkTheme && { color: '#B4C4BB' }]}>{measurementMode === 'three-point' ? 'Measure total pile height from the truck bed floor in centimetres.' : 'Enter the extra mound height above the truck wall height in metres.'}</Text>
        {measurementMode === 'three-point' ? <View style={styles.measurementRow}>
          {(['front', 'middle', 'back'] as const).map(position => (
            <View key={position} style={styles.measurementField}>
              <Text style={[styles.measurementLabel, isDarkTheme && { color: '#B4C4BB' }]}>{position[0].toUpperCase() + position.slice(1)} (cm)</Text>
              <TextInput accessibilityLabel={`${position} pile height in centimetres`} keyboardType="decimal-pad"
                value={pileHeights[position]} placeholder="0" placeholderTextColor={isDarkTheme ? '#5A6761' : undefined} style={[styles.notesInput, { minHeight: 48 }, isDarkTheme && { backgroundColor: '#21372C', color: '#F1F6F3' }]}
                onChangeText={value => { setPileHeights(current => ({ ...current, [position]: value })); setTonnagePreview(null); }} />
            </View>
          ))}
        </View> : <View style={styles.fieldGroup}><Text style={[styles.measurementLabel, isDarkTheme && { color: '#B4C4BB' }]}>Pile Height (m)</Text><TextInput accessibilityLabel="pile height in metres" keyboardType="decimal-pad" value={pileHeightM} onChangeText={value => { setPileHeightM(value); setTonnagePreview(null); }} placeholder="0" placeholderTextColor={isDarkTheme ? '#5A6761' : undefined} style={[styles.notesInput, isDarkTheme && { backgroundColor: '#21372C', color: '#F1F6F3' }]} /></View>}
        <Text style={[styles.formSectionTitle, styles.sectionSpacing, isDarkTheme && { color: '#F1F6F3' }]}>Measurements</Text>
        <View style={styles.measurementRow}>
          <MeasurementField label="Length (m)" value={length} />
          <MeasurementField label="Width (m)" value={width} />
          <MeasurementField label="Height (m)" value={height} />
        </View>
        <Text style={[styles.helperText, isDarkTheme && { color: '#B4C4BB' }]}>{selectedTruck ? `Dimensions are locked to the admin registration for ${truckPlate}.` : 'Register a truck in the dashboard, then reopen this screen to select it.'}</Text>

        <Pressable
          accessibilityLabel="Calculate estimated tonnage"
          accessibilityRole="button"
          disabled={!selectedTruck}
          onPress={previewTonnage}
          style={[styles.calculateButton, isDarkTheme && { backgroundColor: '#192A22' }, !selectedTruck && styles.calculateButtonDisabled]}>
          <MaterialCommunityIcons color={selectedTruck ? (isDarkTheme ? '#85DCB0' : '#07815f') : '#91a19a'} name="calculator-variant-outline" size={20} />
          <Text style={[styles.calculateButtonLabel, isDarkTheme && { color: '#85DCB0' }, !selectedTruck && styles.calculateButtonLabelDisabled]}>Calculate Tonnage</Text>
        </Pressable>

        {message === 'Select a truck with complete registered dimensions before calculating tonnage.' ? (
          <View style={styles.calculationError} accessibilityRole="alert">
            <Feather name="alert-circle" size={16} color="#B3261E" />
            <Text style={styles.calculationErrorText}>{message}</Text>
          </View>
        ) : null}
        {tonnagePreview ? (
          <View accessibilityRole="summary" style={[styles.tonnagePreview, isDarkTheme && { backgroundColor: '#192A22' }]}>
            <View style={styles.tonnagePreviewDetails}>
              <Text style={styles.tonnagePreviewLabel}>ESTIMATED TONNAGE</Text>
              <Text style={[styles.tonnagePreviewValue, isDarkTheme && { color: '#85DCB0' }]}>{formatTonnage(tonnagePreview.tonnes).replace(/ t$/, '')}<Text style={styles.tonnageUnit}> t</Text></Text>
              <Text style={[styles.tonnagePreviewFormula, isDarkTheme && { color: '#B4C4BB' }]}>{tonnagePreview.measurementMode === 'three-point'
                ? `Average height ${tonnagePreview.avgHeightM?.toFixed(2)} m · Total volume ${tonnagePreview.totalVolumeM3.toFixed(2)} m³ × 294 kg/m³`
                : `Base ${tonnagePreview.baseVolumeM3.toFixed(2)} m³ + slope ${tonnagePreview.slopeCubicM.toFixed(2)} m³ = ${tonnagePreview.totalVolumeM3.toFixed(2)} m³ × 294 kg/m³`}</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={[styles.formSectionTitle, isDarkTheme && { color: '#F1F6F3' }]}>Proof photos (optional)</Text>
          <Text style={[styles.photoInstruction, isDarkTheme && { color: '#B4C4BB' }]}>Up to 5 MB per photo (10 MB for both). Images will not be cropped before upload.</Text>
          <View style={[styles.photoRow, fontScale > 1.3 && { flexDirection: 'column' }]}>
          <AuditPhotoField
            disabled={isSubmitting || isOpeningAuditCamera}
            label="Side"
            loading={openingSlot === 'side'}
            onPress={() => captureAuditPhoto('side')}
            photo={sidePhoto}
          />
          <AuditPhotoField
            disabled={isSubmitting || isOpeningAuditCamera}
            label="Back"
            loading={openingSlot === 'back'}
            onPress={() => captureAuditPhoto('back')}
            photo={backPhoto}
          />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={[styles.formSectionTitle, isDarkTheme && { color: '#F1F6F3' }, { marginBottom: 12 }]}>Notes</Text>
          <TextInput
            accessibilityLabel="Notes"
            multiline
            onChangeText={setNotes}
            placeholder="Add an observation about this load"
            placeholderTextColor="#5A6761"
            style={[styles.notesInput, isDarkTheme && { backgroundColor: '#21372C', color: '#F1F6F3' }]}
            textAlignVertical="top"
            value={notes}
          />
        </View>

        {message && message !== 'Select a truck with complete registered dimensions before calculating tonnage.' ? <ToastMotion><Text accessibilityRole="alert" style={[styles.message, !/^(Synced |All measurements are up to date|(?:Side|Back) photo (?:attached|recovered)|Measurement saved|(?:No connection|Connection lost|Server unavailable)\. Measurement saved)/.test(message) && styles.validationMessage]}>{message}</Text></ToastMotion> : null}
        <Button accessibilityRole="button" isDisabled={isSubmitting} onPress={submitMeasurement} style={styles.submitButton} variant="primary">
          <Button.Label style={styles.submitButtonLabel}>{isSubmitting ? 'Uploading…' : 'Submit Measurement'}</Button.Label>
          <Feather color="#ffffff" name="arrow-right" size={20} />
        </Button>
      </View>
    </ScrollView>
  );

  const renderHistory = () => (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.historyScrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.historyTitleRow}>
        <Text style={[styles.historyPageTitle, isDarkTheme && { color: '#F1F6F3' }]}>Submission history</Text>
        <Text style={[styles.recordCount, isDarkTheme && { color: '#B4C4BB' }]}>{historyLoading ? 'Loading…' : `${visibleHistory.length < history.length ? `${visibleHistory.length} of ` : ''}${history.length} ${history.length === 1 ? 'record' : 'records'}`}</Text>
      </View>

      {pendingSync > 0 && (
        <View style={styles.pendingSyncCard}>
          <View style={styles.pendingSyncLeft}>
            <MaterialCommunityIcons color="#b47800" name="cloud-sync" size={24} />
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={styles.pendingSyncTitle}>
                {pendingSync} Offline Measurement{pendingSync > 1 ? 's' : ''} Stored
              </Text>
              <Text style={styles.pendingSyncSubtext}>
                Saved locally. Auto-syncs when online, or tap to sync now.
              </Text>
            </View>
          </View>
          <Pressable
            accessibilityLabel="Sync offline measurements"
            accessibilityRole="button"
            disabled={isSyncing}
            onPress={handleManualSync}
            style={[styles.syncNowButton, isSyncing && { opacity: 0.7 }]}>
            {isSyncing ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Feather color="#ffffff" name="refresh-cw" size={13} />
                <Text style={styles.syncNowButtonText}>Sync Now</Text>
              </>
            )}
          </Pressable>
        </View>
      )}

      <StaffHistoryFilters value={historyFilters} rows={history} onChange={(...values) => setHistoryFilters(values)} />
      <SkeletonRegion state={historySkeleton} placeholder={<SkeletonRows kind="staff" count={4} />}>
      {historyError ? <Text accessibilityRole="alert" style={styles.dataError}>{historyError}</Text> : null}
      {!historyError && history.length === 0 ? (
        <Card style={styles.emptyHistoryCard}>
          <View style={styles.emptyHistoryIcon}><MaterialCommunityIcons color="#0A7F4F" name="clipboard-text-outline" size={30} /></View>
          <Text style={styles.emptyHistoryTitle}>No submissions yet</Text>
          <Text style={styles.emptyHistoryText}>Your completed truckload submissions will appear here after you submit one.</Text>
        </Card>
      ) : null}
      {history.length > 0 && !visibleHistory.length ? <View style={styles.emptyHistoryCard}>
        <Text style={styles.emptyHistoryText}>No records match these filters</Text>
        <Pressable accessibilityRole="button" onPress={() => setHistoryFilters(['', '', '', '', ''])} style={styles.clearHistoryFilters}><Text style={styles.clearHistoryFiltersText}>Clear filters</Text></Pressable>
      </View> : null}
      {visibleHistory.map((submission, index) => (
        <RevealRow key={submission.id} animate={revealHistory} index={index}>
        <Pressable
          accessibilityHint="Opens the submission details and audit photo"
          accessibilityRole="button"
          accessibilityLabel={`${submission.barangay || 'No area assigned'}, ${submission.driver}, ${formatTonnage(submission.tonnes)}, ${submission.submittedAt}, ${submission.status === 'Synced' ? 'Synced' : submission.status === 'Failed' ? 'Not synced, retry' : 'Waiting to sync'}`}
          key={submission.id}
          onPress={() => setSelectedSubmission(submission)}
          style={styles.historyCardPressable}>
          <View style={[styles.historyCard, isDarkTheme && { backgroundColor: '#192A22' }]}>
            <View style={styles.historyTopRow}>
              <View style={styles.historyMain}>
                <NativeText numberOfLines={1} ellipsizeMode="tail" style={[styles.historyBarangay, isDarkTheme && { color: '#F1F6F3' }, (!submission.barangay || submission.barangay === 'No area assigned') && styles.historyMissingArea]}>{submission.barangay || 'No area assigned'}</NativeText>
                <NativeText numberOfLines={1} ellipsizeMode="tail" style={[styles.historyDriver, isDarkTheme && { color: '#B4C4BB' }]}>{submission.driver} · {submission.submittedAt}</NativeText>
                <UploadSyncBadge status={submission.status === 'Synced' ? 'synced' : isSyncing ? 'syncing' : submission.status === 'Failed' ? 'failed' : 'pending'} />
              </View>
              <View style={styles.historyRight}>
                <NativeText numberOfLines={1} style={styles.tonnage}>{formatHistoryTonnage(submission.tonnes)}</NativeText>
                <Feather color={isDarkTheme ? '#85DCB0' : '#5A6761'} name="chevron-right" size={20} />
              </View>
            </View>
            <View style={[styles.historyMeasurements, isDarkTheme && { borderTopColor: '#203228' }]}>
              {[
                ['Pile volume', submission.slope],
                ['Length', `${submission.length} m`],
                ['Width', `${submission.width} m`],
                ['Height', `${submission.height} m`],
              ].map(([label, value]) => (
                <View key={label} style={styles.historyMeasurementColumn}>
                  <NativeText numberOfLines={1} style={[styles.historyMeasurementLabel, isDarkTheme && { color: '#B4C4BB' }]}>{label}</NativeText>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.historyNumberScroll}>
                    <NativeText accessibilityLabel={`${label}: ${value}`} numberOfLines={1} style={[styles.historyMeasurementValue, isDarkTheme && { color: '#F1F6F3' }]}>{value}</NativeText>
                  </ScrollView>
                </View>
              ))}
            </View>
          </View>
        </Pressable>
        </RevealRow>
      ))}
      </SkeletonRegion>
    </ScrollView>
  );

  const renderProfile = () => {
    const currentMonth = history.length;
    const currentMonthTonnage = history.reduce((total, submission) => total + submission.tonnes, 0);
    const profileName = profile?.name || 'Staff profile';
    return (
      <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
        <SkeletonRegion state={profileSkeleton} placeholder={<SkeletonBlock height={215} radius={24} />}>
        <Card style={styles.profileCard}>
          <LinearGradient pointerEvents="none" colors={['#24846E', '#0D2E27']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.cardGradient} />
          <View pointerEvents="none" style={styles.cardGradientShade} />
          <View style={styles.profileHeroRow}>
          <ResidentAvatar uri={profile?.profilePhotoUrl} name={profile?.name} size={72}/>
          <View style={styles.profileHeroCopy}>
          <Text style={styles.profileName}>{profileName}</Text>
          <Text style={styles.profileRole}>{profile ? `${formatRole(profile.role)} · Volumetric Auditor` : 'Loading profile…'}</Text>
          <View style={styles.activeBadge}><View style={styles.activeStatusDot} /><Text style={styles.activeBadgeText}>Active</Text></View>
          </View>
          </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text numberOfLines={1} adjustsFontSizeToFit style={styles.statValue}>{currentMonth.toLocaleString('en-PH', { maximumFractionDigits: 2 })}</Text>
            <Text style={styles.statLabel}>Submissions</Text>
          </View>
          <View style={[styles.statCard, styles.tonnageStat]}>
            <Text numberOfLines={1} adjustsFontSizeToFit accessibilityLabel={`${currentMonthTonnage.toLocaleString('en-PH', { maximumFractionDigits: 2 })} tonnes`} style={styles.statValue}>{currentMonthTonnage.toLocaleString('en-PH', { maximumFractionDigits: 2 })}<Text style={styles.profileStatUnit}> t</Text></Text>
            <Text style={styles.statLabel}>Total tonnage</Text>
          </View>
        </View>
        </Card>
        </SkeletonRegion>

        <View style={styles.accountCard}>
          <Text style={[styles.accountHeading, isDarkTheme && { color: '#F1F6F3' }]}>Account details</Text>
          <SkeletonRegion state={profileSkeleton} placeholder={<SkeletonRows kind="account" count={4} />}>
          {profileError ? <Text accessibilityRole="alert" style={styles.dataError}>{profileError}</Text> : null}
          {profile || !profileError ? <>
            <ProfileAccountRow icon="phone" label="Contact" value={profile?.phone || profile?.contact || 'Not provided'} />
            <ProfileAccountRow icon="mail" label="Email" value={profile?.email || 'Not provided'} />
            <ProfileAccountRow icon="map-pin" label="Location" value={profile?.location || 'Not provided'} />
            <ProfileAccountRow icon="map-pin" label="Assigned area" value={profile?.barangay || 'Not assigned'} last />
          </> : null}
          </SkeletonRegion>
        </View>

        <Pressable accessibilityRole="button" onPress={() => setEditingProfile(true)} style={[{ minHeight: 56, borderRadius: 16, backgroundColor: '#E3F4EB', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, marginTop: 20 }, isDarkTheme && { backgroundColor: '#192A22' }]}><Feather name="edit-2" size={20} color={isDarkTheme ? '#85DCB0' : '#086B42'}/><Text style={{ color: isDarkTheme ? '#85DCB0' : '#086B42', fontSize: 16, fontWeight: '600' }}>Edit profile</Text></Pressable>
        <ProfileSettingsRow onSignOut={completeSignOut} />
        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Feather color="#B3261E" name="log-out" size={20} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderSubmissionDetails = () => closingSubmission ? (
    <StaffSubmissionDetails
      key={closingSubmission.id}
      visible={Boolean(selectedSubmission)}
      submission={history.find(item => item.id === closingSubmission.id) || closingSubmission}
      syncing={isSyncing}
      onClose={() => setSelectedSubmission(null)}
    />
  ) : null;

  if (editingProfile) return <WorkProfileEditor onClose={() => setEditingProfile(false)} onSaved={updated => { setProfile(updated.user); const id=updated.user._id || updated.user.id; if(id) void saveStaffCache(`profile:${id}`,updated.user); }}/>;

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, isDarkTheme && { backgroundColor: '#101815' }]}>
      <StatusBar backgroundColor={isDarkTheme ? '#101815' : '#ffffff'} style={isDarkTheme ? 'light' : 'dark'} translucent={false} />
        <View style={[styles.header, isDarkTheme && { backgroundColor: '#101815' }, { paddingTop: insets.top }]}>
          <View style={styles.brandHeader}>
            <BrandMark height={48} width={150} />
            <View style={styles.headerCopy}>
              <NativeText numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit style={[styles.headerTitle, isDarkTheme && { color: '#F1F6F3' }]}>{profile?.role ? formatRole(profile.role) : 'Staff'}</NativeText>
              <NativeText numberOfLines={1} ellipsizeMode="tail" adjustsFontSizeToFit style={[styles.headerSubtitle, isDarkTheme && { color: '#B4C4BB' }]}>Tonnage Audit</NativeText>
            </View>
          </View>
        </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={[styles.content, isDarkTheme && { backgroundColor: '#101815' }]}>
        <TabTransition activeKey={activeTab}>
          {activeTab === 'input' ? renderInput() : activeTab === 'history' ? renderHistory() : renderProfile()}
        </TabTransition>
      </KeyboardAvoidingView>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />

      {renderSubmissionDetails()}
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
    </SafeAreaView>
  );
}

function ProfileAccountRow({ icon, label, value, last = false }: { icon: 'id-card' | 'phone' | 'mail' | 'map-pin' | 'clock'; label: string; value: string; last?: boolean }) {
  const isDarkTheme = useAppTheme() === 'dark';
  const placeholder = value === 'Not provided' || value === 'Not assigned';
  return (
    <View style={[styles.profileAccountRow, isDarkTheme && { borderBottomColor: '#203228' }, last && { borderBottomWidth: 0 }]}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.profileAccountIcon, isDarkTheme && { backgroundColor: '#21372C' }]}>
        {icon === 'id-card' ? <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#0A7F4F" /> : <Feather name={icon} size={20} color="#0A7F4F" />}
      </View>
      <View style={styles.profileAccountCopy}>
        <Text style={[styles.profileAccountLabel, isDarkTheme && { color: '#B4C4BB' }]}>{label}</Text>
        <Text style={[styles.profileAccountValue, isDarkTheme && { color: '#F1F6F3' }, placeholder && styles.profileAccountPlaceholder]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  summarySkeleton: { marginBottom: 20 },
  selectSkeleton: { gap: 8, marginBottom: 16 },
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  header: { backgroundColor: '#ffffff' },
  brandHeader: { alignItems: 'center', flexDirection: 'row', minHeight: 64, paddingHorizontal: 20, paddingVertical: 8, gap: 8 },
  headerCopy: { flex: 1, minWidth: 0, justifyContent: 'center' },
  headerTitle: { color: '#121A16', fontFamily: 'Roboto-Regular', fontSize: 14, fontWeight: '700', textAlign: 'right' },
  headerSubtitle: { color: '#5A6761', fontFamily: 'Roboto-Regular', fontSize: 12, fontWeight: '400', marginTop: 1, textAlign: 'right' },
  syncBadge: { alignItems: 'center', backgroundColor: '#4d4b18', borderColor: '#81742a', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6, minHeight: 44 },
  syncText: { color: '#e7d768', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  inputScrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  inputEyebrow: { color: '#086B42', fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  inputTitle: { color: '#121A16', fontSize: 28, fontWeight: '700', marginTop: 4, marginBottom: 28 },
  formSectionTitle: { color: '#121A16', fontSize: 18, fontWeight: '700' },
  sectionSpacing: { marginTop: 28 },
  syncRow: { alignItems: 'flex-start', marginBottom: 16 },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  calculationError: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginTop: 10 },
  calculationErrorText: { color: '#B3261E', fontSize: 13, flex: 1 },
  validationMessage: { color: '#C62F3B' },
  tonnageUnit: { fontSize: 16, fontWeight: '600' },
  navIcon: { width: 56, height: 32, flexShrink: 0, borderRadius: 999, borderCurve: 'circular', overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: '#E3F4EB', borderRadius: 999 },
  scrollContent: { padding: 14, paddingBottom: 32 },
  sectionEyebrow: { color: '#617168', fontSize: 12, fontWeight: '800', letterSpacing: 0.35, marginBottom: 11 },
  formCard: { backgroundColor: '#ffffff', borderColor: '#e5ebe7', borderRadius: 18, borderWidth: 1, elevation: 1, padding: 14, shadowColor: '#153528', shadowOpacity: 0.06, shadowRadius: 10 },
  fieldGroup: { marginTop: 28 },
  label: { color: '#596a61', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  required: { color: '#C62F3B' },
  selectField: { alignItems: 'center', backgroundColor: '#f8faf9', borderColor: '#dce4df', borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 48, justifyContent: 'space-between', paddingHorizontal: 13 },
  selectText: { color: '#1b3025', flex: 1, fontSize: 15, paddingRight: 8 },
  measurementRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  measurementField: { flex: 1 },
  measurementLabel: { color: '#35463F', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  measurementInputWrap: { alignItems: 'center', backgroundColor: '#E8EDEA', borderRadius: 14, flexDirection: 'row', minHeight: 52, paddingHorizontal: 10, paddingVertical: 12 },
  measurementValue: { color: '#35463F', flex: 1, fontSize: 16, fontWeight: '500', marginLeft: 6 },
  helperText: { color: '#5A6761', fontSize: 12, marginTop: 10 },
  truckLoadError: { color: '#b42318', fontSize: 11, lineHeight: 16, marginTop: 8 },
  calculateButton: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 16, flexDirection: 'row', gap: 8, minHeight: 52, padding: 12, justifyContent: 'center', marginTop: 16 },
  calculateButtonDisabled: { backgroundColor: '#f2f5f3', borderColor: '#dce4df' },
  calculateButtonLabel: { color: '#086B42', fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  calculateButtonLabelDisabled: { color: '#91a19a' },
  modeSelector: { flexDirection: 'row', backgroundColor: '#E8F0EC', borderRadius: 14, padding: 4, gap: 4 },
  modeOption: { flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center' },
  modeOptionSelected: { backgroundColor: '#0A7F4F' },
  modeOptionText: { color: '#35463F', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  modeOptionTextSelected: { color: '#FFFFFF' },
  tonnagePreview: { backgroundColor: '#E3F4EB', borderRadius: 20, marginTop: 12, paddingVertical: 16, paddingHorizontal: 18 },
  tonnagePreviewDetails: { alignSelf: 'stretch' },
  tonnagePreviewLabel: { color: '#086B42', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  tonnagePreviewFormula: { color: '#35463F', fontSize: 13, marginTop: 6 },
  tonnagePreviewValue: { color: '#121A16', fontSize: 40, fontWeight: '700', marginTop: 4 },
  photoField: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 156, backgroundColor: '#F8FAF9', borderColor: '#A9BDB1', borderRadius: 18, borderStyle: 'dashed', borderWidth: 1.5, paddingVertical: 18, paddingHorizontal: 8, overflow: 'hidden' },
  photoFieldAttached: { backgroundColor: '#f0faf5', borderColor: '#39a17e' },
  photoFieldDisabled: { opacity: 0.65 },
  photoSlot: { marginTop: 12, flex: 1, minWidth: 140 },
  photoInstruction: { color: '#5A6761', fontSize: 13, marginTop: 8 },
  photoPreview: { ...StyleSheet.absoluteFillObject },
  photoOverlay: { alignItems: 'center' },
  photoOverlayAttached: { backgroundColor: 'rgba(10, 28, 19, 0.82)', borderRadius: 12, padding: 8, alignSelf: 'stretch' },
  cameraBadge: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  cameraBadgeAttached: { backgroundColor: '#07815f' },
  cameraBadgeLoading: { backgroundColor: '#d4ede3' },
  photoTitle: { color: '#121A16', fontSize: 13, fontWeight: '700', marginTop: 8, textAlign: 'center' },
  photoOverlayTitle: { color: '#ffffff' },
  photoCaption: { color: '#5A6761', fontSize: 12, marginTop: 4, textAlign: 'center' },
  photoCaptionAttached: { color: '#ffffff' },
  notesInput: { backgroundColor: '#F1F5F3', borderRadius: 14, color: '#121A16', fontSize: 16, fontWeight: '500', minHeight: 100, padding: 14 },
  message: { color: '#0c7554', fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 12 },
  submitButton: { alignItems: 'center', backgroundColor: '#0A7F4F', borderRadius: 18, flexDirection: 'row', gap: 8, minHeight: 56, height: 'auto', paddingVertical: 14, justifyContent: 'center', marginTop: 28 },
  submitButtonLabel: { color: '#ffffff', fontSize: 17, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  placeholderNote: { color: '#829087', fontSize: 11, lineHeight: 16, marginHorizontal: 5, marginTop: 13 },
  dataError: { color: '#b42318', fontSize: 12, lineHeight: 18, marginHorizontal: 5, marginTop: 13 },
  emptyHistoryCard: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 20, borderWidth: 0, marginTop: 4, padding: 24 },
  emptyHistoryIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3F4EB', alignItems: 'center', justifyContent: 'center' },
  emptyHistoryTitle: { color: '#26382e', fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyHistoryText: { color: '#5A6761', fontSize: 13, marginTop: 6, textAlign: 'center' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#E3EAE6', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1, gap: 4, minHeight: 56 },
  navLabel: { color: '#5A6761', fontSize: 11, fontWeight: '500', textAlign: 'center' },
  navLabelActive: { color: '#086B42', fontWeight: '700' },
  navIndicator: { backgroundColor: '#07815f', borderRadius: 3, height: 4, marginTop: 1, width: 4 },
  clearHistoryFilters: { minHeight: 44, paddingHorizontal: 18, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E3F4EB', marginTop: 16 },
  clearHistoryFiltersText: { color: '#086B42', fontSize: 14, fontWeight: '600' },
  historyScrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  historyPageTitle: { color: '#121A16', fontSize: 28, fontWeight: '700' },
  historyTitleRow: { marginBottom: 16 },
  recordCount: { color: '#5A6761', fontSize: 14, marginTop: 6 },
  cardGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  // Keep secondary text above 4.5:1 even at the lightest gradient stop.
  cardGradientShade: { ...StyleSheet.absoluteFillObject, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.10)' },
  totalCard: { backgroundColor: '#0D2E27', borderRadius: 24, overflow: 'hidden', borderWidth: 0, flexDirection: 'row', marginBottom: 20, paddingVertical: 18, paddingHorizontal: 20 },
  totalStat: { flex: 1, minWidth: 0 },
  totalLabel: { color: '#E3F4EB', fontFamily: 'Roboto-Regular', fontSize: 13, marginTop: 4 },
  totalValue: { color: '#ffffff', fontFamily: 'Roboto-Regular', fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  historyStatUnit: { color: '#E3F4EB', fontFamily: 'Roboto-Regular', fontSize: 16, fontWeight: '500' },
  historyStatDivider: { width: 1, marginHorizontal: 16, backgroundColor: 'rgba(255,255,255,0.2)' },
  historyNumberScroll: { flexGrow: 0, flexShrink: 0 },
  historyCard: { backgroundColor: '#F4F6F5', borderRadius: 20, paddingVertical: 14, paddingHorizontal: 16, alignSelf: 'stretch', flexShrink: 0, overflow: 'visible' },
  historyCardPressable: { borderRadius: 20, minHeight: 44, marginBottom: 12 },
  historyTopRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  historyMain: { flex: 1, minWidth: 0 },
  historyBarangay: { color: '#121A16', fontFamily: 'Roboto-Regular', fontSize: 16, fontWeight: '700' },
  historyMissingArea: { color: '#5A6761' },
  historyDriver: { color: '#5A6761', fontFamily: 'Roboto-Regular', fontSize: 13, marginTop: 3 },
  historyRight: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 6 },
  tonnage: { color: '#0A7F4F', fontFamily: 'Roboto-Regular', fontSize: 18, fontWeight: '700', fontVariant: ['tabular-nums'] },
  historyMeasurements: { flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#DCE4DF', paddingTop: 12, marginTop: 12, gap: 8 },
  historyMeasurementColumn: { flex: 1, minWidth: 0 },
  historyMeasurementLabel: { color: '#5A6761', fontFamily: 'Roboto-Regular', fontSize: 11 },
  historyMeasurementValue: { color: '#121A16', fontFamily: 'Roboto-Regular', fontSize: 14, fontWeight: '600', marginTop: 4 },
  profileScrollContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 },
  profileCard: { backgroundColor: '#0D2E27', borderRadius: 24, overflow: 'hidden', borderWidth: 0, padding: 20, gap: 0 },
  profileHeroRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  profileHeroCopy: { flex: 1, minWidth: 0 },
  avatar: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 32, height: 64, justifyContent: 'center', width: 64, flexShrink: 0, overflow: 'hidden' },
  avatarImage: { borderRadius: 32, height: 64, width: 64 },
  avatarText: { color: '#0B5D44', fontSize: 24, fontWeight: '700' },
  profileName: { color: '#ffffff', fontSize: 22, fontWeight: '700' },
  profileRole: { color: '#E3F4EB', fontSize: 14, marginTop: 4 },
  profileArea: { color: '#718077', fontSize: 12, marginTop: 3 },
  profileBadges: { flexDirection: 'row', gap: 9, marginTop: 13 },
  staffBadge: { backgroundColor: '#fcecff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  staffBadgeText: { color: '#a032b3', fontSize: 11, fontWeight: '800' },
  activeBadge: { backgroundColor: 'rgba(13,46,39,0.45)', borderRadius: 12, paddingHorizontal: 9, paddingVertical: 4, flexDirection: 'row', gap: 5, alignItems: 'center', alignSelf: 'flex-start', marginTop: 8 },
  activeStatusDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#7BE0A8' },
  activeBadgeText: { color: '#ffffff', fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', marginTop: 18, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 16 },
  statCard: { flex: 1, minWidth: 0, paddingRight: 12 },
  tonnageStat: { borderLeftWidth: 1, borderLeftColor: 'rgba(255,255,255,0.2)', paddingLeft: 16, paddingRight: 0 },
  statValue: { color: '#ffffff', fontSize: 30, fontWeight: '700' },
  profileStatUnit: { color: '#E3F4EB', fontSize: 16, fontWeight: '500' },
  statLabel: { color: '#E3F4EB', fontSize: 13, marginTop: 4 },
  statCaption: { color: '#a0aaa4', fontSize: 11, marginTop: 3 },
  accountCard: { marginTop: 28 },
  accountHeading: { color: '#121A16', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  profileAccountRow: { minHeight: 60, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E3EAE6' },
  profileAccountIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#E3F4EB', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  profileAccountCopy: { flex: 1, minWidth: 0 },
  profileAccountLabel: { color: '#5A6761', fontSize: 12, marginBottom: 2 },
  profileAccountValue: { color: '#121A16', fontSize: 15, fontWeight: '600' },
  profileAccountPlaceholder: { color: '#5A6761', fontWeight: '500' },
  signOutButton: { alignItems: 'center', backgroundColor: '#FDECEA', borderRadius: 16, flexDirection: 'row', gap: 8, minHeight: 52, paddingVertical: 12, paddingHorizontal: 16, justifyContent: 'center', marginTop: 28 },
  signOutText: { color: '#B3261E', fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  pickerSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', padding: 18, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#d6ded9', borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  pickerTitle: { color: '#20362a', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  pickerOptionsScroll: { flexGrow: 0 },
  pickerOptionsContent: { paddingBottom: 4 },
  pickerStatus: { color: '#718077', fontSize: 13, lineHeight: 19, paddingVertical: 12 },
  pickerOption: { alignItems: 'center', borderBottomColor: '#edf1ee', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 53 },
  pickerOptionText: { color: '#314238', fontSize: 15, fontWeight: '600' },
  offlineBanner: {
    alignItems: 'center',
    backgroundColor: '#FFF4E0',
    borderRadius: 14,
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  offlineBannerText: {
    color: '#5C3B00',
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  offlinePill: {
    alignItems: 'center',
    backgroundColor: '#eff3f1',
    borderColor: '#d5dfd9',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  offlinePillText: {
    color: '#65756c',
    fontSize: 11,
    fontWeight: '700',
  },
  pendingSyncCard: {
    alignItems: 'center',
    backgroundColor: '#fffdf5',
    borderColor: '#ecd282',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
    padding: 13,
  },
  pendingSyncLeft: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
  },
  pendingSyncTitle: {
    color: '#342600',
    fontSize: 13,
    fontWeight: '800',
  },
  pendingSyncSubtext: {
    color: '#7a6020',
    fontSize: 11,
    marginTop: 2,
  },
  syncNowButton: {
    minHeight: 44,
    alignItems: 'center',
    backgroundColor: '#07815f',
    borderRadius: 12,
    flexDirection: 'row',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  syncNowButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  pendingPillWrap: {
    alignItems: 'center',
    backgroundColor: '#fff5dc',
    borderRadius: 12,
    flexDirection: 'row',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  pendingDot: {
    backgroundColor: '#c08000',
    borderRadius: 4,
    height: 7,
    marginRight: 6,
    width: 7,
  },
  pendingPillText: {
    color: '#a06000',
    fontSize: 11,
    fontWeight: '800',
  },
});
