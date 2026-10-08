import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import NetInfo from '@react-native-community/netinfo';
import { StatusBar } from 'expo-status-bar';
import { Button, Card } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AppSelect, type AppSelectOption } from '@/components/app-select';
import { AppText as Text } from '@/components/app-text';
import { BrandMark } from '@/components/brand-mark';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { clearSession, getSession } from '@/lib/session';
import {
  enqueueStaffTruckload,
  getStaffTruckloadQueueStats,
  subscribeToStaffTruckloadSync,
} from '@/lib/staff-truckload-queue';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const MAX_AUDIT_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_AUDIT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DENSITY_FACTOR = 0.294;

type Tab = 'input' | 'history' | 'profile';
type Truck = {
  plate: string;
  length: string;
  width: string;
  height: string;
};

type TruckResponse = {
  plateNumber: string;
  length: number;
  width: number;
  height: number;
};

type AreaOption = {
  _id: string;
  barangay: string;
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
  shift?: string;
};

type TruckLoadResponse = {
  _id?: string;
  truckPlate?: string;
  routeId?: { barangay?: string; name?: string } | null;
  length?: number;
  width?: number;
  height?: number;
  slope?: number;
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
  tonnes: number;
  status: 'Synced' | 'Pending';
  notes: string;
  photoUrl?: string;
  sidePhotoUrl?: string;
  backPhotoUrl?: string;
};

type TonnagePreview = {
  volumeCubicM: number;
  slopeCubicM: number;
  tonnes: number;
};

const SLOPES = ['0.5 - Moderate Slope', '0.0 - Level Surface', '1.0 - Steep Slope'];

const formatTonnage = (tonnes: number) => `${tonnes.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
const formatFileSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;
const areaLabel = (area: AreaOption) => {
  const match = area.name?.match(/\bArea\s+(\d+)\s*([A-Za-z]?)/i);
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
const calculateTonnage = (length: number, width: number, height: number, slope: number, densityFactor = DENSITY_FACTOR) => {
  const volumeCubicM = length * width * height;
  const slopeCubicM = Number.isFinite(slope) ? slope : 0;
  return Number.isFinite(volumeCubicM) && volumeCubicM > 0
    ? (volumeCubicM + slopeCubicM) * densityFactor
    : 0;
};
const formatSlope = (value?: number) => `${Number(value || 0).toFixed(1)} m³`;
const formatSubmissionDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
};
const formatRole = (value?: string) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Staff';
const initials = (name?: string) => name?.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S';

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
  const calculatedTonnage = calculateTonnage(length, width, height, slope, effectiveDensity);
  return {
    id: load._id || `${load.truckPlate || 'load'}-${load.arrivedAt || Date.now()}`,
    barangay: load.routeId?.barangay || fallbackArea.split(' · ')[0] || 'No area assigned',
    truckPlate: load.truckPlate || 'Unknown truck',
    driver: staffName,
    submittedAt: formatSubmissionDate(load.arrivedAt),
    length,
    width,
    height,
    slope: formatSlope(slope),
    tonnes: calculatedTonnage,
    status: 'Synced',
    notes: load.notes || '',
    photoUrl: load.photoUrl,
    sidePhotoUrl: load.sidePhotoUrl,
    backPhotoUrl: load.backPhotoUrl,
  };
}

async function getAssetSize(asset: ImagePicker.ImagePickerAsset) {
  if (typeof asset.fileSize === 'number') return asset.fileSize;
  const response = await fetch(asset.uri);
  const blob = await response.blob();
  return blob.size;
}

async function prepareAuditPhoto(asset: ImagePicker.ImagePickerAsset): Promise<AuditPhoto> {
  const mimeType = asset.mimeType || 'image/jpeg';
  if (!ALLOWED_AUDIT_PHOTO_TYPES.includes(mimeType)) {
    throw new Error('Use a JPEG, PNG, or WebP audit photo.');
  }

  const size = await getAssetSize(asset);
  if (size > MAX_AUDIT_PHOTO_SIZE) {
    throw new Error(`The photo is ${formatFileSize(size)}. Retake it at a lower resolution; the 5 MB limit is strict.`);
  }

  const extension = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  return {
    uri: asset.uri,
    fileName: asset.fileName || `truckload-audit-${Date.now()}.${extension}`,
    mimeType,
    size,
    width: asset.width,
    height: asset.height,
    capturedAt: new Date().toISOString(),
    webFile: asset.file,
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

function AuditPhotoField({ disabled, label, onPress, photo }: { disabled: boolean; label: string; onPress: () => void; photo: AuditPhoto | null }) {
  return (
    <View style={styles.photoSlot}>
      <Text style={styles.label}>{label} photo <Text style={styles.required}>*</Text></Text>
      <Pressable
        accessibilityLabel={`${label} proof photo`}
        accessibilityRole="button"
        disabled={disabled}
        onPress={onPress}
        style={[styles.photoField, photo && styles.photoFieldAttached, disabled && styles.photoFieldDisabled]}>
        {photo ? <Image accessibilityLabel={`${label} proof photo attached`} resizeMode="contain" source={{ uri: photo.uri }} style={styles.photoPreview} /> : null}
        <View style={[styles.photoOverlay, photo && styles.photoOverlayAttached]}>
          <View style={[styles.cameraBadge, photo && styles.cameraBadgeAttached]}>
            <Feather color={photo ? '#ffffff' : '#07815f'} name={photo ? 'check' : 'camera'} size={21} />
          </View>
          <Text style={[styles.photoTitle, photo && styles.photoOverlayTitle]}>{photo ? `${label} photo attached` : `Capture ${label} photo`}</Text>
          <Text style={[styles.photoCaption, photo && styles.photoCaptionAttached]}>{photo ? `${formatFileSize(photo.size)} · Ready` : 'Original image · 5 MB maximum'}</Text>
        </View>
      </Pressable>
    </View>
  );
}

function SelectField({ disabled = false, label, onChange, options, placeholder, value }: { disabled?: boolean; label: string; onChange: (value: string) => void; options: AppSelectOption[]; placeholder: string; value: string }) {
  return <AppSelect disabled={disabled} label={label} onChange={onChange} options={options} placeholder={placeholder} value={value} />;
}

function MeasurementField({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.measurementField}>
      <Text style={styles.measurementLabel}>{label}</Text>
      <View style={styles.measurementInputWrap}>
        <Feather color="#95a49d" name="lock" size={12} />
        <Text accessibilityLabel={`${label}, locked`} style={styles.measurementValue}>{value || '—'}</Text>
      </View>
    </View>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: Tab; onChange: (tab: Tab) => void }) {
  const insets = useSafeAreaInsets();
  const items: { key: Tab; label: string; icon: 'clipboard' | 'activity' | 'user' }[] = [
    { key: 'input', label: 'Input', icon: 'clipboard' },
    { key: 'history', label: 'History', icon: 'activity' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <View style={[styles.bottomNav, { height: 72 + insets.bottom, paddingBottom: insets.bottom }]}>
      {items.map((item) => {
        const active = activeTab === item.key;
        return (
          <Pressable
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            key={item.key}
            onPress={() => onChange(item.key)}
            style={styles.navItem}>
            <Feather color={active ? '#07815f' : '#9aa29d'} name={item.icon} size={21} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
            {active ? <View style={styles.navIndicator} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

export default function StaffScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [isLoadingTrucks, setIsLoadingTrucks] = useState(true);
  const [truckLoadError, setTruckLoadError] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [areas, setAreas] = useState<AreaOption[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(true);
  const [areaLoadError, setAreaLoadError] = useState('');
  const [area, setArea] = useState('');
  const [routeId, setRouteId] = useState('');
  const [drivers, setDrivers] = useState<string[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(true);
  const [driverLoadError, setDriverLoadError] = useState('');
  const [driver, setDriver] = useState('');
  const [slope, setSlope] = useState(SLOPES[0]);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [sidePhoto, setSidePhoto] = useState<AuditPhoto | null>(null);
  const [backPhoto, setBackPhoto] = useState<AuditPhoto | null>(null);
  const [isOpeningAuditCamera, setIsOpeningAuditCamera] = useState(false);
  const [tonnagePreview, setTonnagePreview] = useState<TonnagePreview | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [pendingSync, setPendingSync] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const loadRegisteredTrucks = async () => {
      if (!API_URL) {
        if (!cancelled) {
          setTruckLoadError('Truck list is unavailable until EXPO_PUBLIC_API_URL is configured.');
          setIsLoadingTrucks(false);
        }
        return;
      }

      try {
        const session = await getSession();
        if (!session?.token) throw new Error('Sign in again to load the registered trucks.');

        const response = await fetch(`${API_URL}/trucks`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load registered trucks.');

        const registeredTrucks = ((result.data?.trucks || []) as TruckResponse[]).map((truck) => ({
          plate: truck.plateNumber,
          length: String(truck.length),
          width: String(truck.width),
          height: String(truck.height),
        }));
        const firstTruck = registeredTrucks[0];

        if (!cancelled) {
          setTrucks(registeredTrucks);
          setTruckPlate(firstTruck?.plate || '');
          setLength(firstTruck?.length || '');
          setWidth(firstTruck?.width || '');
          setHeight(firstTruck?.height || '');
        }
      } catch (error) {
        if (!cancelled) setTruckLoadError(error instanceof Error ? error.message : 'Unable to load registered trucks.');
      } finally {
        if (!cancelled) setIsLoadingTrucks(false);
      }
    };

    loadRegisteredTrucks();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unsubscribe: (() => void) | undefined;

    const refreshHistory = async (token: string, staffName: string) => {
      if (!API_URL) return;
      try {
        const response = await fetch(`${API_URL}/staff/truckloads`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const result = await response.json();
        if (!cancelled && response.ok && result.success) {
          const loads = (result.data?.loads || []) as TruckLoadResponse[];
          setHistory(loads.map((load) => mapTruckLoad(load, staffName)));
          setHistoryError('');
          setHistoryLoading(false);
        }
      } catch {
        // The queue remains local when the reconnect is unstable. The next
        // connectivity event will retry without interrupting the staff UI.
      }
    };

    const setupQueueSync = async () => {
      if (!API_URL) return;
      const session = await getSession();
      const staffId = session?.user?._id || session?.user?.id;
      if (!session?.token || !staffId) return;

      const context = { apiUrl: API_URL, token: session.token, staffId };
      const stats = await getStaffTruckloadQueueStats(staffId);
      if (!cancelled) setPendingSync(stats.pending);

      unsubscribe = subscribeToStaffTruckloadSync(context, async (result) => {
        if (cancelled) return;
        setPendingSync(result.pending);
        if (result.synced > 0) {
          await refreshHistory(session.token, session.user.name || profile?.name || 'You');
        }
      });
    };

    void setupQueueSync().catch(() => {
      // Local queue initialization should never block the staff screen.
    });

    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [profile?.name]);

  useEffect(() => {
    let cancelled = false;

    const loadAreas = async () => {
      if (!API_URL) {
        if (!cancelled) {
          setAreaLoadError('Area list is unavailable until EXPO_PUBLIC_API_URL is configured.');
          setIsLoadingAreas(false);
        }
        return;
      }

      try {
        const session = await getSession();
        if (!session?.token) throw new Error('Sign in again to load the available areas.');

        const response = await fetch(`${API_URL}/staff/areas`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load available areas.');

        const availableAreas = [...(((result.data || {}) as AreasResponse).areas || [])]
          .filter((item) => item?._id && item.barangay)
          .sort(compareAreas);
        if (!cancelled) {
          setAreas(availableAreas);
          setArea((current) => current || (availableAreas[0] ? areaLabel(availableAreas[0]) : ''));
          setRouteId((current) => current || availableAreas[0]?._id || '');
        }
      } catch (error) {
        if (!cancelled) setAreaLoadError(error instanceof Error ? error.message : 'Unable to load available areas.');
      } finally {
        if (!cancelled) setIsLoadingAreas(false);
      }
    };

    loadAreas();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadDrivers = async () => {
      if (!API_URL) {
        if (!cancelled) {
          setDriverLoadError('Driver list is unavailable until EXPO_PUBLIC_API_URL is configured.');
          setIsLoadingDrivers(false);
        }
        return;
      }

      try {
        const session = await getSession();
        if (!session?.token) throw new Error('Sign in again to load the available drivers.');

        const response = await fetch(`${API_URL}/staff/drivers`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load available drivers.');

        const availableDrivers = [...(((result.data || {}) as DriversResponse).drivers || [])]
          .map((item) => item.name)
          .filter(Boolean)
          .sort((first, second) => first.localeCompare(second, undefined, { sensitivity: 'base' }));
        if (!cancelled) {
          setDrivers(availableDrivers);
          setDriver((current) => current || availableDrivers[0] || '');
        }
      } catch (error) {
        if (!cancelled) setDriverLoadError(error instanceof Error ? error.message : 'Unable to load available drivers.');
      } finally {
        if (!cancelled) setIsLoadingDrivers(false);
      }
    };

    loadDrivers();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadStaffData = async () => {
      if (!API_URL) {
        if (!cancelled) {
          setProfileError('Profile is unavailable until EXPO_PUBLIC_API_URL is configured.');
          setHistoryError('Submission history is unavailable until EXPO_PUBLIC_API_URL is configured.');
          setProfileLoading(false);
          setHistoryLoading(false);
        }
        return;
      }

      try {
        const session = await getSession();
        if (!session?.token) throw new Error('Sign in again to load your staff data.');

        const headers = { Authorization: `Bearer ${session.token}` };
        const [profileResponse, historyResponse] = await Promise.all([
          fetch(`${API_URL}/auth/me`, { headers }),
          fetch(`${API_URL}/staff/truckloads`, { headers }),
        ]);
        const [profileResult, historyResult] = await Promise.all([
          profileResponse.json(),
          historyResponse.json(),
        ]);

        if (!cancelled) {
          if (!profileResponse.ok || !profileResult.success) {
            setProfileError(profileResult.error || 'Unable to load your profile.');
          } else {
            setProfile(profileResult.data || null);
          }
          setProfileLoading(false);

          if (!historyResponse.ok || !historyResult.success) {
            setHistoryError(historyResult.error || 'Unable to load your submission history.');
          } else {
            const loads = (historyResult.data?.loads || []) as TruckLoadResponse[];
            const staffName = profileResult.data?.name || 'You';
            setHistory(loads.map((load) => mapTruckLoad(load, staffName)));
          }
          setHistoryLoading(false);
        }
      } catch (error) {
        if (!cancelled) {
          const errorMessage = error instanceof Error ? error.message : 'Unable to load your staff data.';
          setProfileError(errorMessage);
          setHistoryError(errorMessage);
          setProfileLoading(false);
          setHistoryLoading(false);
        }
      }
    };

    loadStaffData();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restorePendingCameraResult = async () => {
      try {
        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (cancelled || !pendingResult || 'code' in pendingResult || pendingResult.canceled || !pendingResult.assets?.length) return;

        const photo = await prepareAuditPhoto(pendingResult.assets[0]);
        if (!cancelled) {
          if (!sidePhoto) {
            setSidePhoto(photo);
            setMessage(`Side photo recovered after returning from the camera (${formatFileSize(photo.size)}).`);
          } else if (!backPhoto) {
            setBackPhoto(photo);
            setMessage(`Back photo recovered after returning from the camera (${formatFileSize(photo.size)}).`);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(error instanceof Error ? error.message : 'The camera returned, but the photo could not be recovered.');
        }
      }
    };

    restorePendingCameraResult();
    return () => { cancelled = true; };
  }, [backPhoto, sidePhoto]);

  const totalTonnage = useMemo(() => history.reduce((total, submission) => total + submission.tonnes, 0), [history]);
  const selectedTruck = trucks.find((truck) => truck.plate === truckPlate);

  const previewTonnage = () => {
    const numericLength = Number(length);
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const slopeCubicM = slopeValue(slope);

    if (!Number.isFinite(numericLength) || !Number.isFinite(numericWidth) || !Number.isFinite(numericHeight)
      || numericLength <= 0 || numericWidth <= 0 || numericHeight <= 0) {
      setTonnagePreview(null);
      setMessage('Select a truck with complete registered dimensions before calculating tonnage.');
      return;
    }

    const volumeCubicM = numericLength * numericWidth * numericHeight;
    setTonnagePreview({
      volumeCubicM,
      slopeCubicM,
      tonnes: calculateTonnage(numericLength, numericWidth, numericHeight, slopeCubicM),
    });
    setMessage('');
  };

  const completeSignOut = async () => {
    await clearSession();
    router.replace('/login');
  };

  const signOut = () => setIsSignOutConfirmVisible(true);

  const captureAuditPhoto = async (slot: AuditPhotoSlot) => {
    if (isSubmitting || isOpeningAuditCamera) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Camera permission is required to capture the audit photo.');
        return;
      }

      setIsOpeningAuditCamera(true);
      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: false,
        cameraType: ImagePicker.CameraType.back,
        mediaTypes: ['images'],
        quality: 0.65,
      });
      setIsOpeningAuditCamera(false);
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const photo = await prepareAuditPhoto(result.assets[0]);
      if (slot === 'side') setSidePhoto(photo);
      else setBackPhoto(photo);
      setMessage(`${slot === 'side' ? 'Side' : 'Back'} photo attached (${formatFileSize(photo.size)}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to capture the audit photo.');
    } finally {
      setIsOpeningAuditCamera(false);
    }
  };

  const submitMeasurement = async () => {
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

    if (!sidePhoto || !backPhoto) {
      setMessage('Capture both a Side photo and a Back photo before submitting.');
      return;
    }

    if (!numericLength || !numericWidth || !numericHeight) {
      setMessage('The selected truck has incomplete registered dimensions.');
      return;
    }

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
          length,
          width,
          height,
          slope: String(slopeValue(slope)),
          notes: notes.trim(),
          sidePhoto,
          backPhoto,
        });
        const queueStats = await getStaffTruckloadQueueStats(staffId);
        const pendingSubmission: Submission = {
          id: clientSubmissionId,
          barangay: area || 'No area assigned',
          truckPlate,
          driver: profile?.name || 'You',
          submittedAt: formatSubmissionDate(new Date().toISOString()),
          length: numericLength,
          width: numericWidth,
          height: numericHeight,
          slope: formatSlope(slopeValue(slope)),
          tonnes: tonnagePreview?.tonnes || calculateTonnage(numericLength, numericWidth, numericHeight, slopeValue(slope)),
          status: 'Pending',
          notes: notes.trim(),
        };
        setHistory((current) => [pendingSubmission, ...current]);
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
      // Keep the exact dimensions registered by the admin. Truck dimensions are metres.
      formData.append('length', length);
      formData.append('width', width);
      formData.append('height', height);
      formData.append('slope', String(slopeValue(slope)));
      formData.append('notes', notes.trim());

      appendAuditPhoto(formData, 'sidePhoto', sidePhoto);
      appendAuditPhoto(formData, 'backPhoto', backPhoto);
      formData.append('sidePhotoMetadata', auditPhotoMetadata(sidePhoto));
      formData.append('backPhotoMetadata', auditPhotoMetadata(backPhoto));

      let response: Response;
      try {
        response = await fetch(`${API_URL}/staff/truckloads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.token}` },
          body: formData,
        });
      } catch {
        await queueSubmission('Connection lost. Measurement saved locally and will sync automatically.');
        return;
      }
      const result = await response.json().catch(() => ({} as { error?: string }));
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
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 11 }}>
        <Text style={[styles.sectionEyebrow, { marginBottom: 0 }]}>NEW MEASUREMENT</Text>
        {pendingSync > 0 && (
          <View style={styles.syncBadge}>
            <MaterialCommunityIcons color="#e2c84b" name="sync" size={15} />
            <Text style={styles.syncText}>{pendingSync} pending sync</Text>
          </View>
        )}
      </View>
      <Card style={styles.formCard}>
        <SelectField
          disabled={isLoadingTrucks || Boolean(truckLoadError) || trucks.length === 0}
          label="Truck"
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
          options={trucks.map((truck) => ({ label: `${truck.plate} · ${truck.length}×${truck.width}×${truck.height} m`, value: truck.plate }))}
          placeholder={isLoadingTrucks ? 'Loading registered trucks…' : trucks.length ? 'Select truck' : 'No registered trucks available'}
          value={truckPlate}
        />
        {truckLoadError ? <Text style={styles.truckLoadError}>{truckLoadError}</Text> : null}
        <SelectField
          disabled={isLoadingAreas || Boolean(areaLoadError) || areas.length === 0}
          label="Area"
          onChange={(option) => {
            const selectedArea = areas.find((item) => areaLabel(item) === option);
            setArea(option);
            setRouteId(selectedArea?._id || '');
          }}
          options={areas.map((item) => ({ label: areaLabel(item), value: areaLabel(item) }))}
          placeholder={isLoadingAreas ? 'Loading areas…' : areas.length ? 'Select area' : 'No areas available'}
          value={area}
        />
        {areaLoadError ? <Text style={styles.truckLoadError}>{areaLoadError}</Text> : null}
        <SelectField
          disabled={isLoadingDrivers || Boolean(driverLoadError) || drivers.length === 0}
          label="Driver"
          onChange={setDriver}
          options={drivers.map((item) => ({ label: item, value: item }))}
          placeholder={isLoadingDrivers ? 'Loading drivers…' : drivers.length ? 'Select driver' : 'No drivers available'}
          value={driver}
        />
        {driverLoadError ? <Text style={styles.truckLoadError}>{driverLoadError}</Text> : null}

        <View style={styles.measurementRow}>
          <MeasurementField label="Length (m)" value={length} />
          <MeasurementField label="Width (m)" value={width} />
          <MeasurementField label="Height (m)" value={height} />
        </View>
        <Text style={styles.helperText}>{selectedTruck ? `Dimensions are locked to the admin registration for ${truckPlate}.` : 'Register a truck in the dashboard, then reopen this screen to select it.'}</Text>

        <SelectField label="Slope (m³)" onChange={(option) => { setSlope(option); setTonnagePreview(null); }} options={SLOPES.map((option) => ({ label: option, value: option }))} placeholder="Select slope" value={slope} />

        <Pressable
          accessibilityLabel="Calculate estimated tonnage"
          accessibilityRole="button"
          disabled={!selectedTruck}
          onPress={previewTonnage}
          style={[styles.calculateButton, !selectedTruck && styles.calculateButtonDisabled]}>
          <MaterialCommunityIcons color={selectedTruck ? '#07815f' : '#91a19a'} name="calculator-variant-outline" size={20} />
          <Text style={[styles.calculateButtonLabel, !selectedTruck && styles.calculateButtonLabelDisabled]}>Calculate Tonnage</Text>
        </Pressable>

        {tonnagePreview ? (
          <View accessibilityRole="summary" style={styles.tonnagePreview}>
            <View style={styles.tonnagePreviewDetails}>
              <Text style={styles.tonnagePreviewLabel}>ESTIMATED TONNAGE</Text>
              <Text style={styles.tonnagePreviewFormula}>
                ({tonnagePreview.volumeCubicM.toFixed(2)} m³ + {tonnagePreview.slopeCubicM.toFixed(1)} m³ slope) × 294 kg/m³
              </Text>
            </View>
            <Text style={styles.tonnagePreviewValue}>{formatTonnage(tonnagePreview.tonnes)}</Text>
          </View>
        ) : null}

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Proof photos <Text style={styles.required}>*</Text></Text>
          <Text style={styles.photoInstruction}>Submit the original images. They will not be cropped before upload.</Text>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting || isOpeningAuditCamera}
            onPress={() => captureAuditPhoto('side')}
            style={[styles.photoField, sidePhoto && styles.photoFieldAttached, isSubmitting && styles.photoFieldDisabled]}>
            {sidePhoto ? <Image accessibilityLabel="Captured side proof photo" resizeMode="contain" source={{ uri: sidePhoto.uri }} style={styles.photoPreview} /> : null}
            <View style={[styles.photoOverlay, sidePhoto && styles.photoOverlayAttached]}>
              <View style={[styles.cameraBadge, sidePhoto && styles.cameraBadgeAttached]}>
                <Feather color={sidePhoto ? '#ffffff' : '#07815f'} name={sidePhoto ? 'check' : 'camera'} size={21} />
              </View>
              <Text style={[styles.photoTitle, sidePhoto && styles.photoOverlayTitle]}>{sidePhoto ? 'Side photo attached' : 'Capture Side photo'}</Text>
              <Text style={[styles.photoCaption, sidePhoto && styles.photoCaptionAttached]}>{sidePhoto ? `${formatFileSize(sidePhoto.size)} · Ready to upload` : 'JPEG, PNG, or WebP · 5 MB maximum'}</Text>
            </View>
          </Pressable>
          <AuditPhotoField disabled={isSubmitting || isOpeningAuditCamera} label="Back" onPress={() => captureAuditPhoto('back')} photo={backPhoto} />
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Notes</Text>
          <TextInput
            accessibilityLabel="Notes"
            multiline
            onChangeText={setNotes}
            placeholder="Add an observation about this load"
            placeholderTextColor="#9ca9a3"
            style={styles.notesInput}
            textAlignVertical="top"
            value={notes}
          />
        </View>

        {message ? <Text accessibilityRole="alert" style={styles.message}>{message}</Text> : null}
        <Button accessibilityRole="button" isDisabled={isSubmitting} onPress={submitMeasurement} style={styles.submitButton} variant="primary">
          <Button.Label style={styles.submitButtonLabel}>{isSubmitting ? 'Uploading…' : 'Submit Measurement'}</Button.Label>
          <Feather color="#ffffff" name="arrow-right" size={20} />
        </Button>
      </Card>
      <Text style={styles.placeholderNote}>Truckloads, audit photos, profile details, and submission history are connected to the backend.</Text>
    </ScrollView>
  );

  const renderHistory = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.historyTitleRow}>
        <Text style={styles.sectionEyebrow}>SUBMISSION HISTORY</Text>
        <Text style={styles.recordCount}>{historyLoading ? 'Loading…' : `${history.length} records`}</Text>
      </View>

      <Card style={styles.totalCard}>
        <View>
          <Text style={styles.totalLabel}>TOTAL TONNAGE</Text>
          <Text style={styles.totalValue}>{formatTonnage(totalTonnage)}</Text>
          <Text style={styles.totalCaption}>All recorded submissions</Text>
        </View>
        <View style={styles.totalEntries}>
          <Text style={styles.entriesLabel}>ENTRIES</Text>
          <Text style={styles.entriesValue}>{history.length}</Text>
        </View>
      </Card>

      {historyLoading ? <Text style={styles.placeholderNote}>Loading your real submission history…</Text> : null}
      {!historyLoading && historyError ? <Text accessibilityRole="alert" style={styles.dataError}>{historyError}</Text> : null}
      {!historyLoading && !historyError && history.length === 0 ? (
        <Card style={styles.emptyHistoryCard}>
          <MaterialCommunityIcons color="#07815f" name="clipboard-text-outline" size={30} />
          <Text style={styles.emptyHistoryTitle}>No submissions yet</Text>
          <Text style={styles.emptyHistoryText}>Your completed truckload submissions will appear here after you submit one.</Text>
        </Card>
      ) : null}
      {!historyLoading && !historyError ? history.map((submission) => (
        <Pressable
          accessibilityHint="Opens the submission details and audit photo"
          accessibilityRole="button"
          key={submission.id}
          onPress={() => setSelectedSubmission(submission)}
          style={styles.historyCardPressable}>
          <Card style={styles.historyCard}>
            <View style={styles.historyTopRow}>
              <View style={styles.loadIcon}><MaterialCommunityIcons color="#07815f" name="truck-outline" size={20} /></View>
              <View style={styles.historyMain}>
                <Text style={styles.historyBarangay}>{submission.barangay}</Text>
                <Text style={styles.historyDriver}>{submission.driver}</Text>
              </View>
              <View style={styles.historyAmount}>
                <Text style={styles.tonnage}>{formatTonnage(submission.tonnes)}</Text>
                <Text style={styles.historyDate}>{submission.submittedAt}</Text>
              </View>
              <Feather color="#9aa9a1" name="chevron-right" size={18} />
            </View>
            <View style={styles.historyDetailRow}>
              <Text style={styles.historyDetail}>L {submission.length} m</Text>
              <Text style={styles.historyDetail}>W {submission.width} m</Text>
              <Text style={styles.historyDetail}>H {submission.height} m</Text>
              <Text style={styles.historyDetail}>Slope {submission.slope}</Text>
              {submission.status === 'Pending' ? <Text style={styles.pendingPill}>Pending</Text> : null}
            </View>
          </Card>
        </Pressable>
      )) : null}
    </ScrollView>
  );

  const renderProfile = () => {
    const currentMonth = history.length;
    const currentMonthTonnage = history.reduce((total, submission) => total + submission.tonnes, 0);
    const profileName = profile?.name || 'Staff profile';
    const profileArea = profile?.barangay || 'Not assigned';
    const profileShift = profile?.shift ? `${formatRole(profile.shift)} shift` : 'Not provided';
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard}>
          <View style={styles.avatar}>{profile?.profilePhotoUrl ? <Image accessibilityLabel="Profile picture" source={{ uri: profile.profilePhotoUrl }} style={styles.avatarImage} /> : <Text style={styles.avatarText}>{initials(profile?.name)}</Text>}</View>
          <Text style={styles.profileName}>{profileName}</Text>
          <Text style={styles.profileRole}>{profile ? `${formatRole(profile.role)} · Volumetric Auditor` : 'Loading profile…'}</Text>
          <Text style={styles.profileArea}>{profileArea}</Text>
          <View style={styles.profileBadges}>
            <View style={styles.staffBadge}><Text style={styles.staffBadgeText}>Staff</Text></View>
            <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Active</Text></View>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{currentMonth}</Text>
            <Text style={styles.statLabel}>Submissions</Text>
            <Text style={styles.statCaption}>All recorded</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{formatTonnage(currentMonthTonnage)}</Text>
            <Text style={styles.statLabel}>Total Tonnage</Text>
            <Text style={styles.statCaption}>Computed</Text>
          </Card>
        </View>

        <Card style={styles.accountCard}>
          <Text style={styles.accountHeading}>ACCOUNT DETAILS</Text>
          {profileLoading ? <Text style={styles.placeholderNote}>Loading your account details…</Text> : null}
          {!profileLoading && profileError ? <Text accessibilityRole="alert" style={styles.dataError}>{profileError}</Text> : null}
          {!profileLoading && !profileError ? <>
            <DetailRow label="Employee ID" value={profile?.employeeId || 'Not provided'} />
            <DetailRow label="Contact" value={profile?.contact || 'Not provided'} />
            <DetailRow label="Email" value={profile?.email || 'Not provided'} />
            <DetailRow label="Assigned Area" value={profile?.barangay || 'Not assigned'} />
            <DetailRow label="Shift" value={profileShift} />
          </> : null}
        </Card>

        <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}>
          <Feather color="#e23d4f" name="log-out" size={17} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    );
  };

  const renderSubmissionDetails = () => {
    if (!selectedSubmission) return null;

    return (
      <Modal animationType="slide" onRequestClose={() => setSelectedSubmission(null)} transparent visible>
        <View style={styles.modalBackdrop}>
          <Pressable accessibilityLabel="Close submission details" onPress={() => setSelectedSubmission(null)} style={styles.modalDismissArea} />
          <View style={[styles.detailsSheet, { paddingBottom: insets.bottom + 18 }]}>
            <View style={styles.detailsHeader}>
              <View style={styles.detailsHeaderText}>
                <Text style={styles.detailsEyebrow}>AUDIT SUBMISSION</Text>
                <Text style={styles.detailsTitle}>Submission details</Text>
              </View>
              <Pressable accessibilityLabel="Close submission details" accessibilityRole="button" onPress={() => setSelectedSubmission(null)} style={styles.detailsClose}>
                <Feather color="#314238" name="x" size={20} />
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={[styles.detailsContent, { paddingBottom: insets.bottom + 28 }]}
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={styles.detailsScroll}>
              {selectedSubmission.sidePhotoUrl || selectedSubmission.backPhotoUrl || selectedSubmission.photoUrl ? (
                <View style={styles.detailsPhotoGrid}>
                  {selectedSubmission.sidePhotoUrl ? <View style={styles.detailsPhotoItem}><Text style={styles.detailsPhotoLabel}>Side photo</Text><Image accessibilityLabel="Side audit submission photo" resizeMode="contain" source={{ uri: selectedSubmission.sidePhotoUrl }} style={styles.detailsPhoto} /></View> : null}
                  {selectedSubmission.backPhotoUrl ? <View style={styles.detailsPhotoItem}><Text style={styles.detailsPhotoLabel}>Back photo</Text><Image accessibilityLabel="Back audit submission photo" resizeMode="contain" source={{ uri: selectedSubmission.backPhotoUrl }} style={styles.detailsPhoto} /></View> : null}
                  {!selectedSubmission.sidePhotoUrl && !selectedSubmission.backPhotoUrl && selectedSubmission.photoUrl ? <View style={styles.detailsPhotoItem}><Text style={styles.detailsPhotoLabel}>Audit photo</Text><Image accessibilityLabel="Audit submission photo" resizeMode="contain" source={{ uri: selectedSubmission.photoUrl }} style={styles.detailsPhoto} /></View> : null}
                </View>
              ) : (
                <View style={styles.noPhotoCard}>
                  <MaterialCommunityIcons color="#07815f" name="image-off-outline" size={28} />
                  <Text style={styles.noPhotoText}>Audit photo unavailable</Text>
                </View>
              )}

              <View style={styles.detailsStatusRow}>
                <View style={styles.syncedPill}>
                  <View style={styles.syncedDot} />
                  <Text style={styles.syncedPillText}>{selectedSubmission.status}</Text>
                </View>
                <Text style={styles.detailsDate}>{selectedSubmission.submittedAt}</Text>
              </View>

              <Text style={styles.detailsSectionTitle}>Load information</Text>
              <DetailRow label="Truck" value={selectedSubmission.truckPlate} />
              <DetailRow label="Area" value={selectedSubmission.barangay} />
              <DetailRow label="Driver" value={selectedSubmission.driver} />

              <Text style={styles.detailsSectionTitle}>Measurements</Text>
              <View style={styles.detailsMeasurementGrid}>
                <View style={styles.detailsMeasurementItem}>
                  <Text style={styles.detailsMeasurementLabel}>Length</Text>
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.length} m</Text>
                </View>
                <View style={styles.detailsMeasurementItem}>
                  <Text style={styles.detailsMeasurementLabel}>Width</Text>
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.width} m</Text>
                </View>
                <View style={styles.detailsMeasurementItem}>
                  <Text style={styles.detailsMeasurementLabel}>Height</Text>
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.height} m</Text>
                </View>
              </View>
              <DetailRow label="Slope" value={selectedSubmission.slope} />
              <DetailRow label="Estimated tonnage" value={formatTonnage(selectedSubmission.tonnes)} />

              {selectedSubmission.notes ? (
                <View style={styles.notesPreview}>
                  <Text style={styles.detailsMeasurementLabel}>Notes</Text>
                  <Text style={styles.notesPreviewText}>{selectedSubmission.notes}</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <StatusBar backgroundColor={activeTab === 'profile' ? '#f4f7f5' : '#EBF7F5'} style="dark" translucent={false} />
      {activeTab !== 'profile' && (
        <View style={[styles.header, { paddingTop: insets.top }]}>
          <View style={styles.brandHeader}>
            <BrandMark height={116} width={206} />
            <View style={styles.headerCopy}>
              <Text style={styles.headerSubtitle}>Staff · Tonnage Audit</Text>
              <Text style={styles.headerTitle}>Volumetric Input</Text>
            </View>
          </View>
        </View>
      )}

      <View style={[styles.content, activeTab === 'profile' && { paddingTop: insets.top }]}>
        {activeTab === 'input' ? renderInput() : null}
        {activeTab === 'history' ? renderHistory() : null}
        {activeTab === 'profile' ? renderProfile() : null}
      </View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />

      {renderSubmissionDetails()}
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f5' },
  header: { backgroundColor: '#EBF7F5' },
  brandHeader: { alignItems: 'center', flexDirection: 'row', height: 70, paddingHorizontal: 20 },
  headerCopy: { alignItems: 'flex-end', flex: 1, marginLeft: 8 },
  headerTitle: { color: '#20372a', fontSize: 14, fontWeight: '800', marginTop: 1, textAlign: 'right' },
  headerSubtitle: { color: '#5d7066', fontSize: 10, textAlign: 'right' },
  syncBadge: { alignItems: 'center', backgroundColor: '#4d4b18', borderColor: '#81742a', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  syncText: { color: '#e7d768', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 32 },
  sectionEyebrow: { color: '#617168', fontSize: 12, fontWeight: '800', letterSpacing: 0.35, marginBottom: 11 },
  formCard: { backgroundColor: '#ffffff', borderColor: '#e5ebe7', borderRadius: 18, borderWidth: 1, elevation: 1, padding: 14, shadowColor: '#153528', shadowOpacity: 0.06, shadowRadius: 10 },
  fieldGroup: { marginTop: 13 },
  label: { color: '#596a61', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  required: { color: '#d8434b' },
  selectField: { alignItems: 'center', backgroundColor: '#f8faf9', borderColor: '#dce4df', borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 48, justifyContent: 'space-between', paddingHorizontal: 13 },
  selectText: { color: '#1b3025', flex: 1, fontSize: 15, paddingRight: 8 },
  measurementRow: { flexDirection: 'row', gap: 8, marginTop: 16 },
  measurementField: { flex: 1 },
  measurementLabel: { color: '#69776f', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  measurementInputWrap: { alignItems: 'center', backgroundColor: '#f1f4f2', borderColor: '#e1e7e3', borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 43, paddingHorizontal: 10 },
  measurementValue: { color: '#526159', flex: 1, fontSize: 14, marginLeft: 8 },
  helperText: { color: '#96a29b', fontSize: 10, marginTop: 8 },
  truckLoadError: { color: '#b42318', fontSize: 11, lineHeight: 16, marginTop: 8 },
  calculateButton: { alignItems: 'center', backgroundColor: '#eff8f4', borderColor: '#92cbb4', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 8, height: 48, justifyContent: 'center', marginTop: 13 },
  calculateButtonDisabled: { backgroundColor: '#f2f5f3', borderColor: '#dce4df' },
  calculateButtonLabel: { color: '#07815f', fontSize: 14, fontWeight: '800' },
  calculateButtonLabelDisabled: { color: '#91a19a' },
  tonnagePreview: { alignItems: 'center', backgroundColor: '#eaf8f1', borderColor: '#9ed4ba', borderRadius: 14, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 13 },
  tonnagePreviewDetails: { flex: 1 },
  tonnagePreviewLabel: { color: '#35745b', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  tonnagePreviewFormula: { color: '#5d776a', fontSize: 10, marginTop: 5 },
  tonnagePreviewValue: { color: '#067452', fontSize: 21, fontWeight: '800', marginLeft: 12 },
  photoField: { alignItems: 'center', backgroundColor: '#fbfdfc', borderColor: '#d7e3dc', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, paddingVertical: 20 },
  photoFieldAttached: { backgroundColor: '#f0faf5', borderColor: '#39a17e' },
  photoFieldDisabled: { opacity: 0.65 },
  photoSlot: { marginTop: 12 },
  photoInstruction: { color: '#718078', fontSize: 11, lineHeight: 16, marginTop: 4 },
  photoPreview: { borderRadius: 14, height: 180, width: '100%' },
  photoOverlay: { alignItems: 'center' },
  photoOverlayAttached: { backgroundColor: 'rgba(10, 28, 19, 0.52)', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  cameraBadge: { alignItems: 'center', backgroundColor: '#e7f5ef', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  cameraBadgeAttached: { backgroundColor: '#07815f' },
  photoTitle: { color: '#33463b', fontSize: 13, fontWeight: '800', marginTop: 8 },
  photoOverlayTitle: { color: '#ffffff' },
  photoCaption: { color: '#d95a65', fontSize: 11, fontWeight: '700', marginTop: 4 },
  photoCaptionAttached: { color: '#ffffff' },
  notesInput: { backgroundColor: '#f8faf9', borderColor: '#dce4df', borderRadius: 14, borderWidth: 1, color: '#20362a', fontSize: 14, minHeight: 75, padding: 12 },
  message: { color: '#0c7554', fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 12 },
  submitButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 14, flexDirection: 'row', gap: 8, height: 50, justifyContent: 'center', marginTop: 17 },
  submitButtonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  placeholderNote: { color: '#829087', fontSize: 11, lineHeight: 16, marginHorizontal: 5, marginTop: 13 },
  dataError: { color: '#b42318', fontSize: 12, lineHeight: 18, marginHorizontal: 5, marginTop: 13 },
  emptyHistoryCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 4, padding: 24 },
  emptyHistoryTitle: { color: '#26382e', fontSize: 16, fontWeight: '800', marginTop: 10 },
  emptyHistoryText: { color: '#718078', fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#e3e9e5', borderTopWidth: 1, flexDirection: 'row', height: 72, justifyContent: 'space-around', paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1, gap: 3 },
  navLabel: { color: '#99a29d', fontSize: 11, fontWeight: '600' },
  navLabelActive: { color: '#07815f', fontWeight: '800' },
  navIndicator: { backgroundColor: '#07815f', borderRadius: 3, height: 4, marginTop: 1, width: 4 },
  historyTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  recordCount: { color: '#718078', fontSize: 12, marginBottom: 11 },
  totalCard: { backgroundColor: '#07815f', borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13, overflow: 'hidden', padding: 17 },
  totalLabel: { color: '#b8ded0', fontSize: 11, fontWeight: '800' },
  totalValue: { color: '#ffffff', fontSize: 25, fontWeight: '800', marginTop: 5 },
  totalCaption: { color: '#a8d2c3', fontSize: 11, marginTop: 4 },
  totalEntries: { alignItems: 'flex-end', justifyContent: 'center' },
  entriesLabel: { color: '#b8ded0', fontSize: 11, fontWeight: '700' },
  entriesValue: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 5 },
  historyCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginBottom: 9, padding: 13 },
  historyCardPressable: { borderRadius: 16 },
  historyTopRow: { alignItems: 'center', flexDirection: 'row' },
  loadIcon: { alignItems: 'center', backgroundColor: '#e9f5ef', borderRadius: 13, height: 38, justifyContent: 'center', width: 38 },
  historyMain: { flex: 1, marginLeft: 10 },
  historyBarangay: { color: '#24372d', fontSize: 13, fontWeight: '800' },
  historyDriver: { color: '#95a29b', fontSize: 11, marginTop: 3 },
  historyAmount: { alignItems: 'flex-end' },
  tonnage: { color: '#07815f', fontSize: 16, fontWeight: '800' },
  historyDate: { color: '#9aa59f', fontSize: 10, marginTop: 3 },
  historyDetailRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  historyDetail: { color: '#738179', fontSize: 10, fontWeight: '600' },
  pendingPill: { color: '#a56300', fontSize: 10, fontWeight: '800' },
  profileCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 18, borderWidth: 1, padding: 22 },
  avatar: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 29, height: 58, justifyContent: 'center', width: 58 },
  avatarImage: { borderRadius: 29, height: 58, width: 58 },
  avatarText: { color: '#ffffff', fontSize: 25, fontWeight: '700' },
  profileName: { color: '#26382e', fontSize: 17, fontWeight: '800', marginTop: 12 },
  profileRole: { color: '#718077', fontSize: 12, marginTop: 5 },
  profileArea: { color: '#718077', fontSize: 12, marginTop: 3 },
  profileBadges: { flexDirection: 'row', gap: 9, marginTop: 13 },
  staffBadge: { backgroundColor: '#fcecff', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  staffBadgeText: { color: '#a032b3', fontSize: 11, fontWeight: '800' },
  activeBadge: { backgroundColor: '#e7f8ee', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  activeBadgeText: { color: '#0b8658', fontSize: 11, fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 13 },
  statCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 17, borderWidth: 1, flex: 1, paddingVertical: 16 },
  statValue: { color: '#07815f', fontSize: 23, fontWeight: '800' },
  statLabel: { color: '#314238', fontSize: 12, fontWeight: '800', marginTop: 5 },
  statCaption: { color: '#a0aaa4', fontSize: 11, marginTop: 3 },
  accountCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 16 },
  accountHeading: { color: '#65756c', fontSize: 12, fontWeight: '800', letterSpacing: 0.45, marginBottom: 12 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  detailLabel: { color: '#9aa49f', fontSize: 12 },
  detailValue: { color: '#344239', fontSize: 12, fontWeight: '600', maxWidth: '58%', textAlign: 'right' },
  signOutButton: { alignItems: 'center', borderColor: '#ffdadd', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 7, height: 45, justifyContent: 'center', marginTop: 13 },
  signOutText: { color: '#e23d4f', fontSize: 12, fontWeight: '800' },
  modalBackdrop: { backgroundColor: 'rgba(10, 28, 19, 0.42)', flex: 1, justifyContent: 'flex-end' },
  modalDismissArea: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  pickerSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '75%', padding: 18, paddingBottom: 32 },
  detailsSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1, maxHeight: '90%', paddingHorizontal: 18, paddingTop: 18, width: '100%' },
  detailsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  detailsHeaderText: { flex: 1 },
  detailsEyebrow: { color: '#07815f', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  detailsTitle: { color: '#20362a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  detailsClose: { alignItems: 'center', backgroundColor: '#f1f5f2', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  detailsScroll: { flexShrink: 1 },
  detailsContent: { paddingBottom: 30, paddingTop: 16 },
  detailsPhotoGrid: { gap: 12 },
  detailsPhotoItem: { gap: 6 },
  detailsPhotoLabel: { color: '#65756c', fontSize: 11, fontWeight: '800' },
  detailsPhoto: { backgroundColor: '#edf3ef', borderRadius: 16, height: 220, width: '100%' },
  noPhotoCard: { alignItems: 'center', backgroundColor: '#f1f5f2', borderRadius: 16, height: 150, justifyContent: 'center' },
  noPhotoText: { color: '#718077', fontSize: 12, fontWeight: '700', marginTop: 8 },
  detailsStatusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  syncedPill: { alignItems: 'center', backgroundColor: '#e7f8ee', borderRadius: 12, flexDirection: 'row', paddingHorizontal: 9, paddingVertical: 5 },
  syncedDot: { backgroundColor: '#0b8658', borderRadius: 4, height: 7, marginRight: 6, width: 7 },
  syncedPillText: { color: '#0b8658', fontSize: 11, fontWeight: '800' },
  detailsDate: { color: '#8b9991', fontSize: 11 },
  detailsSectionTitle: { color: '#65756c', fontSize: 11, fontWeight: '800', letterSpacing: 0.5, marginTop: 20 },
  detailsMeasurementGrid: { flexDirection: 'row', gap: 8, marginTop: 12 },
  detailsMeasurementItem: { backgroundColor: '#f4f8f5', borderRadius: 12, flex: 1, padding: 11 },
  detailsMeasurementLabel: { color: '#8b9991', fontSize: 11, fontWeight: '700' },
  detailsMeasurementValue: { color: '#26382e', fontSize: 14, fontWeight: '800', marginTop: 5 },
  notesPreview: { backgroundColor: '#f8faf9', borderRadius: 12, marginTop: 18, padding: 12 },
  notesPreviewText: { color: '#344239', fontSize: 13, lineHeight: 19, marginTop: 5 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#d6ded9', borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  pickerTitle: { color: '#20362a', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  pickerOptionsScroll: { flexGrow: 0 },
  pickerOptionsContent: { paddingBottom: 4 },
  pickerStatus: { color: '#718077', fontSize: 13, lineHeight: 19, paddingVertical: 12 },
  pickerOption: { alignItems: 'center', borderBottomColor: '#edf1ee', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 53 },
  pickerOptionText: { color: '#314238', fontSize: 15, fontWeight: '600' },
});
