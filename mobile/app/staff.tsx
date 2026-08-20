import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { Button, Card } from 'heroui-native';
import { useEffect, useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSession } from '@/lib/session';

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const MAX_AUDIT_PHOTO_SIZE = 5 * 1024 * 1024;
const ALLOWED_AUDIT_PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

type Tab = 'input' | 'history' | 'profile';
type PickerKind = 'truck' | 'area' | 'driver' | 'slope' | null;

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

type AreasResponse = {
  areas?: string[];
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
  tonnesEstimate?: number;
  arrivedAt?: string;
  notes?: string;
  photoUrl?: string;
};

type AuditPhoto = {
  uri: string;
  fileName: string;
  mimeType: string;
  size: number;
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
};

const SLOPES = ['0.5 - Moderate Slope', '0.0 - Level Surface', '1.0 - Steep Slope'];

const formatTonnage = (tonnes: number) => `${tonnes.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;
const formatFileSize = (size: number) => `${(size / (1024 * 1024)).toFixed(1)} MB`;
const formatSubmissionDate = (value?: string) => {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Date unavailable'
    : date.toLocaleString('en-PH', { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' });
};
const formatRole = (value?: string) => value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Staff';
const initials = (name?: string) => name?.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'S';

function mapTruckLoad(load: TruckLoadResponse, staffName = 'You'): Submission {
  return {
    id: load._id || `${load.truckPlate || 'load'}-${load.arrivedAt || Date.now()}`,
    barangay: load.routeId?.barangay || 'No area assigned',
    truckPlate: load.truckPlate || 'Unknown truck',
    driver: staffName,
    submittedAt: formatSubmissionDate(load.arrivedAt),
    length: Number(load.length || 0),
    width: Number(load.width || 0),
    height: Number(load.height || 0),
    slope: '—',
    tonnes: Number(load.tonnesEstimate || 0),
    status: 'Synced',
    notes: load.notes || '',
    photoUrl: load.photoUrl,
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
    webFile: asset.file,
  };
}

function SelectField({ label, value, onPress }: { label: string; value: string; onPress: () => void }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <Pressable accessibilityRole="button" onPress={onPress} style={styles.selectField}>
        <Text numberOfLines={1} style={styles.selectText}>{value}</Text>
        <Feather color="#304a3e" name="chevron-down" size={20} />
      </Pressable>
    </View>
  );
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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [trucks, setTrucks] = useState<Truck[]>([]);
  const [isLoadingTrucks, setIsLoadingTrucks] = useState(true);
  const [truckLoadError, setTruckLoadError] = useState('');
  const [truckPlate, setTruckPlate] = useState('');
  const [areas, setAreas] = useState<string[]>([]);
  const [isLoadingAreas, setIsLoadingAreas] = useState(true);
  const [areaLoadError, setAreaLoadError] = useState('');
  const [area, setArea] = useState('');
  const [drivers, setDrivers] = useState<string[]>([]);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(true);
  const [driverLoadError, setDriverLoadError] = useState('');
  const [driver, setDriver] = useState('');
  const [slope, setSlope] = useState(SLOPES[0]);
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [notes, setNotes] = useState('');
  const [auditPhoto, setAuditPhoto] = useState<AuditPhoto | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Submission[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState('');
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState('');
  const pendingSync = 0;

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
          .sort((first, second) => first.localeCompare(second, undefined, { numeric: true, sensitivity: 'base' }));
        if (!cancelled) {
          setAreas(availableAreas);
          setArea((current) => current || availableAreas[0] || '');
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
          setAuditPhoto(photo);
          setMessage(`Audit photo recovered after returning from the camera (${formatFileSize(photo.size)}).`);
        }
      } catch (error) {
        if (!cancelled) {
          setAuditPhoto(null);
          setMessage(error instanceof Error ? error.message : 'The camera returned, but the photo could not be recovered.');
        }
      }
    };

    restorePendingCameraResult();
    return () => { cancelled = true; };
  }, []);

  const totalTonnage = useMemo(() => history.reduce((total, submission) => total + submission.tonnes, 0), [history]);
  const selectedTruck = trucks.find((truck) => truck.plate === truckPlate);

  const pickerOptions = pickerKind === 'truck'
    ? trucks.map((truck) => truck.plate)
    : pickerKind === 'area'
      ? areas
      : pickerKind === 'driver'
        ? drivers
        : pickerKind === 'slope'
          ? SLOPES
          : [];

  const pickerTitle = pickerKind === 'truck'
    ? 'Select truck'
    : pickerKind === 'area'
      ? 'Select area'
      : pickerKind === 'driver'
        ? 'Select driver'
        : 'Select slope';

  const chooseOption = (option: string) => {
    if (pickerKind === 'truck') {
      const truck = trucks.find((item) => item.plate === option);
      if (truck) {
        setTruckPlate(truck.plate);
        setLength(truck.length);
        setWidth(truck.width);
        setHeight(truck.height);
      }
    }
    if (pickerKind === 'area') setArea(option);
    if (pickerKind === 'driver') setDriver(option);
    if (pickerKind === 'slope') setSlope(option);
    setPickerKind(null);
  };

  const captureAuditPhoto = async () => {
    if (isSubmitting) return;

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setMessage('Camera permission is required to capture the audit photo.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        allowsEditing: true,
        aspect: [4, 3],
        cameraType: ImagePicker.CameraType.back,
        mediaTypes: ['images'],
        quality: 0.7,
      });
      if (result.canceled) return;

      const photo = await prepareAuditPhoto(result.assets[0]);
      setAuditPhoto(photo);
      setMessage(`Audit photo attached (${formatFileSize(photo.size)}).`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to capture the audit photo.');
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

    if (!auditPhoto) {
      setMessage('Capture an audit photo before submitting.');
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

      const formData = new FormData();
      formData.append('truckPlate', truckPlate);
      // Keep the exact dimensions registered by the admin. The backend stores these values as cm.
      formData.append('length', length);
      formData.append('width', width);
      formData.append('height', height);
      formData.append('notes', notes.trim());

      if (auditPhoto.webFile) {
        formData.append('photo', auditPhoto.webFile as Blob);
      } else {
        formData.append('photo', {
          uri: auditPhoto.uri,
          name: auditPhoto.fileName,
          type: auditPhoto.mimeType,
        } as unknown as Blob);
      }

      const response = await fetch(`${API_URL}/staff/truckloads`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData,
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to submit the truckload.');

      const savedLoad = result.data as TruckLoadResponse;
      setHistory((current) => [mapTruckLoad(savedLoad, profile?.name || 'You'), ...current]);
      setHistoryError('');
      setHistoryLoading(false);
      setAuditPhoto(null);
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
      <Text style={styles.sectionEyebrow}>NEW MEASUREMENT</Text>
      <Card style={styles.formCard}>
        <SelectField
          label="Truck"
          onPress={() => setPickerKind('truck')}
          value={selectedTruck ? `${truckPlate} · ${selectedTruck.length}×${selectedTruck.width}×${selectedTruck.height} cm` : isLoadingTrucks ? 'Loading registered trucks…' : 'No registered trucks available'}
        />
        {truckLoadError ? <Text style={styles.truckLoadError}>{truckLoadError}</Text> : null}
        <SelectField label="Area" onPress={() => setPickerKind('area')} value={area || (isLoadingAreas ? 'Loading areas…' : 'No areas available')} />
        {areaLoadError ? <Text style={styles.truckLoadError}>{areaLoadError}</Text> : null}
        <SelectField label="Driver" onPress={() => setPickerKind('driver')} value={driver || (isLoadingDrivers ? 'Loading drivers…' : 'No drivers available')} />
        {driverLoadError ? <Text style={styles.truckLoadError}>{driverLoadError}</Text> : null}

        <View style={styles.measurementRow}>
          <MeasurementField label="Length (cm)" value={length} />
          <MeasurementField label="Width (cm)" value={width} />
          <MeasurementField label="Height (cm)" value={height} />
        </View>
        <Text style={styles.helperText}>{selectedTruck ? `Dimensions are locked to the admin registration for ${truckPlate}.` : 'Register a truck in the dashboard, then reopen this screen to select it.'}</Text>

        <SelectField label="Slope (m³)" onPress={() => setPickerKind('slope')} value={slope} />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Audit Photo <Text style={styles.required}>*</Text></Text>
          <Pressable
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={captureAuditPhoto}
            style={[styles.photoField, auditPhoto && styles.photoFieldAttached, isSubmitting && styles.photoFieldDisabled]}>
            {auditPhoto ? <Image accessibilityLabel="Captured audit photo" resizeMode="cover" source={{ uri: auditPhoto.uri }} style={styles.photoPreview} /> : null}
            <View style={[styles.photoOverlay, auditPhoto && styles.photoOverlayAttached]}>
              <View style={[styles.cameraBadge, auditPhoto && styles.cameraBadgeAttached]}>
                <Feather color={auditPhoto ? '#ffffff' : '#07815f'} name={auditPhoto ? 'check' : 'camera'} size={21} />
              </View>
              <Text style={[styles.photoTitle, auditPhoto && styles.photoOverlayTitle]}>{auditPhoto ? 'Audit photo attached' : 'Capture Audit Photo'}</Text>
              <Text style={[styles.photoCaption, auditPhoto && styles.photoCaptionAttached]}>{auditPhoto ? `${formatFileSize(auditPhoto.size)} · Ready to upload` : 'JPEG, PNG, or WebP · 5 MB maximum'}</Text>
            </View>
          </Pressable>
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
            <Text style={styles.historyDetail}>L {submission.length} cm</Text>
            <Text style={styles.historyDetail}>W {submission.width} cm</Text>
            <Text style={styles.historyDetail}>H {submission.height} cm</Text>
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
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials(profile?.name)}</Text></View>
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
              {selectedSubmission.photoUrl ? (
                <Image accessibilityLabel="Audit submission photo" resizeMode="cover" source={{ uri: selectedSubmission.photoUrl }} style={styles.detailsPhoto} />
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
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.length} cm</Text>
                </View>
                <View style={styles.detailsMeasurementItem}>
                  <Text style={styles.detailsMeasurementLabel}>Width</Text>
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.width} cm</Text>
                </View>
                <View style={styles.detailsMeasurementItem}>
                  <Text style={styles.detailsMeasurementLabel}>Height</Text>
                  <Text style={styles.detailsMeasurementValue}>{selectedSubmission.height} cm</Text>
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
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Volumetric Input</Text>
          <Text style={styles.headerSubtitle}>Staff · Tonnage Audit</Text>
        </View>
        <View style={styles.syncBadge}>
          <MaterialCommunityIcons color="#e2c84b" name="sync" size={15} />
          <Text style={styles.syncText}>{pendingSync} pending sync</Text>
        </View>
      </View>

      <View style={styles.content}>
        {activeTab === 'input' ? renderInput() : null}
        {activeTab === 'history' ? renderHistory() : null}
        {activeTab === 'profile' ? renderProfile() : null}
      </View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />

      <Modal animationType="slide" onRequestClose={() => setPickerKind(null)} transparent visible={pickerKind !== null}>
        <Pressable onPress={() => setPickerKind(null)} style={styles.modalBackdrop}>
          <Pressable onPress={(event) => event.stopPropagation()} style={styles.pickerSheet}>
            <View style={styles.sheetHandle} />
            <Text style={styles.pickerTitle}>{pickerTitle}</Text>
            <ScrollView
              contentContainerStyle={styles.pickerOptionsContent}
              showsVerticalScrollIndicator
              style={styles.pickerOptionsScroll}>
              {pickerKind === 'truck' && isLoadingTrucks ? <Text style={styles.pickerStatus}>Loading registered trucks…</Text> : null}
              {pickerKind === 'truck' && truckLoadError ? <Text style={styles.pickerStatus}>{truckLoadError}</Text> : null}
              {pickerKind === 'truck' && !isLoadingTrucks && !truckLoadError && pickerOptions.length === 0 ? <Text style={styles.pickerStatus}>No trucks are registered yet.</Text> : null}
              {pickerKind === 'area' && isLoadingAreas ? <Text style={styles.pickerStatus}>Loading available areas…</Text> : null}
              {pickerKind === 'area' && areaLoadError ? <Text style={styles.pickerStatus}>{areaLoadError}</Text> : null}
              {pickerKind === 'area' && !isLoadingAreas && !areaLoadError && pickerOptions.length === 0 ? <Text style={styles.pickerStatus}>No active areas are available.</Text> : null}
              {pickerKind === 'driver' && isLoadingDrivers ? <Text style={styles.pickerStatus}>Loading available drivers…</Text> : null}
              {pickerKind === 'driver' && driverLoadError ? <Text style={styles.pickerStatus}>{driverLoadError}</Text> : null}
              {pickerKind === 'driver' && !isLoadingDrivers && !driverLoadError && pickerOptions.length === 0 ? <Text style={styles.pickerStatus}>No drivers are available.</Text> : null}
              {pickerOptions.map((option) => (
                <Pressable key={option} onPress={() => chooseOption(option)} style={styles.pickerOption}>
                  <Text style={styles.pickerOptionText}>{option}</Text>
                  <Feather color="#07815f" name="chevron-right" size={19} />
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
      {renderSubmissionDetails()}
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
  header: { alignItems: 'center', backgroundColor: '#064b37', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 16, paddingHorizontal: 17, paddingTop: 10 },
  headerTitle: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  headerSubtitle: { color: '#a8c2b7', fontSize: 12, marginTop: 3 },
  syncBadge: { alignItems: 'center', backgroundColor: '#4d4b18', borderColor: '#81742a', borderRadius: 18, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 10, paddingVertical: 6 },
  syncText: { color: '#e7d768', fontSize: 11, fontWeight: '700' },
  content: { flex: 1 },
  scrollContent: { padding: 14, paddingBottom: 102 },
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
  photoField: { alignItems: 'center', backgroundColor: '#fbfdfc', borderColor: '#d7e3dc', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, paddingVertical: 20 },
  photoFieldAttached: { backgroundColor: '#f0faf5', borderColor: '#39a17e' },
  photoFieldDisabled: { opacity: 0.65 },
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
