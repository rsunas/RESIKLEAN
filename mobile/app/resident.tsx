import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from 'heroui-native';
import { BarangayPicker } from '@/components/barangay-picker';
import { clearSession, getSession, saveSession, type AuthSession } from '@/lib/session';
import { getResidentScheduleFixture, type ApiWasteType, type ScheduleData, type UpcomingCollection } from '@/types/resident-schedule';

type ResidentTab = 'home' | 'schedule' | 'report' | 'profile';

type ApiReport = {
  _id: string;
  barangay: string;
  description: string;
  photoUrl?: string | null;
  bagCount?: number | null;
  detectedBagCount?: number | null;
  aiResult?: {
    bagCount?: number | null;
    detectedBagCount?: number | null;
  };
  status: 'pending' | 'verified' | 'scheduled' | 'rejected' | 'resolved';
  createdAt: string;
};

type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const CITY = 'Naga City';
const USE_SCHEDULE_FIXTURE = process.env.NODE_ENV === 'development' && process.env.EXPO_PUBLIC_USE_SCHEDULE_FIXTURE === 'true';

type WasteLabel = 'Biodegradable' | 'Non-Biodegradable';

function toWasteLabel(type?: ApiWasteType | null): WasteLabel {
  return type === 'non-biodegradable' ? 'Non-Biodegradable' : 'Biodegradable';
}

function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions) {
  if (!value) return 'No upcoming collection';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString('en-PH', options);
}

function formatTime(value: string | Date | null | undefined) {
  if (!value) return 'Time unavailable';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return date.toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });
}

function dateKey(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

function getCurrentWeekDates() {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const mondayOffset = (today.getDay() + 6) % 7;
  today.setDate(today.getDate() - mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() + index);
    return date;
  });
}

function getDetectedBagCount(report: ApiReport) {
  const count = report.detectedBagCount
    ?? report.bagCount
    ?? report.aiResult?.detectedBagCount
    ?? report.aiResult?.bagCount;

  return typeof count === 'number' ? `${count} bag${count === 1 ? '' : 's'}` : 'Not available';
}

function CollectionBanner({
  barangay,
  collection,
  onDismiss,
}: {
  barangay: string;
  collection: UpcomingCollection;
  onDismiss: () => void;
}) {
  return (
    <View style={styles.collectionBanner}>
      <View style={styles.bannerCheck}><Feather color="#ffffff" name="check" size={12} /></View>
      <View style={styles.bannerTextWrap}>
        <Text style={styles.bannerTitle}>Collection scheduled today</Text>
        <Text style={styles.bannerSubtitle}>{barangay} · {toWasteLabel(collection.wasteType)}</Text>
      </View>
      <Pressable accessibilityLabel="Dismiss collection update" hitSlop={10} onPress={onDismiss}>
        <Feather color="#dcfff0" name="x" size={16} />
      </Pressable>
    </View>
  );
}

function WastePill({ type }: { type: 'Biodegradable' | 'Non-Biodegradable' }) {
  const biodegradable = type === 'Biodegradable';
  return (
    <View style={[styles.wastePill, biodegradable ? styles.bioPill : styles.nonBioPill]}>
      <MaterialCommunityIcons color={biodegradable ? '#07815f' : '#2f70d7'} name={biodegradable ? 'leaf' : 'recycle'} size={11} />
      <Text style={[styles.wastePillText, biodegradable ? styles.bioPillText : styles.nonBioPillText]}>{type}</Text>
    </View>
  );
}

function StatusPill({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const style = normalized === 'resolved' ? styles.resolvedPill : normalized === 'rejected' ? styles.rejectedPill : styles.scheduledPill;
  const textStyle = normalized === 'resolved' ? styles.resolvedText : normalized === 'rejected' ? styles.rejectedText : styles.scheduledText;
  const dotStyle = normalized === 'resolved' ? styles.resolvedDot : normalized === 'rejected' ? styles.rejectedDot : styles.scheduledDot;
  const label = normalized === 'pending'
    ? 'Pending'
    : normalized === 'verified' || normalized === 'scheduled'
      ? 'Acknowledged-Scheduled'
      : normalized === 'resolved'
        ? 'Resolved'
        : 'Rejected';
  return <View style={[styles.statusPill, style]}><View style={[styles.statusDot, dotStyle]} /><Text style={[styles.statusText, textStyle]}>{label}</Text></View>;
}

function BottomNavigation({ activeTab, onChange }: { activeTab: ResidentTab; onChange: (tab: ResidentTab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs: Array<{ key: ResidentTab; label: string; icon: 'home' | 'calendar' | 'camera' | 'user' }> = [
    { key: 'home', label: 'Home', icon: 'home' },
    { key: 'schedule', label: 'Schedule', icon: 'calendar' },
    { key: 'report', label: 'Report', icon: 'camera' },
    { key: 'profile', label: 'Profile', icon: 'user' },
  ];

  return (
    <View style={[styles.bottomNav, { height: 70 + insets.bottom, paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        return (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.key} onPress={() => onChange(tab.key)} style={styles.navItem}>
            <Feather color={active ? '#008c68' : '#9aa8a0'} name={tab.icon} size={18} />
            <Text style={[styles.navText, active && styles.navTextActive]}>{tab.label}</Text>
            {active ? <View style={styles.navIndicator} /> : <View style={styles.navIndicatorPlaceholder} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function ReportList({ reports }: { reports: ApiReport[] }) {
  if (!reports.length) {
    return <Text style={styles.emptyReportText}>No reports submitted yet.</Text>;
  }

  return (
    <>
      {reports.map((report) => (
        <View key={report._id} style={styles.pastReportRow}>
          <View style={styles.reportThumbnail}>
            {report.photoUrl ? <Image source={{ uri: report.photoUrl }} style={styles.reportThumbnailImage} /> : <Feather color="#9aa69f" name="image" size={17} />}
          </View>
          <View style={styles.reportMain}>
            <Text numberOfLines={1} style={styles.reportLocation}>{report.barangay || 'Location not recorded'}</Text>
            <Text numberOfLines={1} style={styles.reportMeta}>{formatDate(report.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })} · Detected bags: {getDetectedBagCount(report)}</Text>
            {report.description ? <Text numberOfLines={1} style={styles.reportDescription}>{report.description}</Text> : null}
          </View>
          <StatusPill status={report.status} />
        </View>
      ))}
    </>
  );
}

export default function ResidentScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ResidentTab>('home');
  const [showBanner, setShowBanner] = useState(true);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [pastReports, setPastReports] = useState<ApiReport[]>([]);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileBarangay, setProfileBarangay] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');

  const loadSchedule = useCallback(async (token: string, residentBarangay?: string) => {
    if (!residentBarangay) {
      setSchedule(null);
      setScheduleError('Add a barangay in your profile to load your schedule.');
      setIsLoadingSchedule(false);
      return;
    }

    setIsLoadingSchedule(true);
    setScheduleError('');

    if (USE_SCHEDULE_FIXTURE) {
      const fixture = getResidentScheduleFixture(residentBarangay);
      if (fixture) {
        setSchedule(fixture);
        setIsLoadingSchedule(false);
        return;
      }
    }

    if (!API_URL) {
      setSchedule(null);
      setScheduleError('Schedule service is not configured.');
      setIsLoadingSchedule(false);
      return;
    }

    try {
      const query = `?barangay=${encodeURIComponent(residentBarangay)}`;
      const response = await fetch(`${API_URL}/resident/schedule${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as ApiResponse<ScheduleData>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your collection schedule.');
      const scheduleData = result.data || null;
      setSchedule(scheduleData);
      if (!scheduleData?.routes?.length) {
        setScheduleError('No collection schedule is available for this location yet.');
      }
    } catch (error) {
      setScheduleError(error instanceof Error ? error.message : 'Unable to load your collection schedule.');
    } finally {
      setIsLoadingSchedule(false);
    }
  }, []);

  const loadReports = useCallback(async (token: string) => {
    if (!API_URL) {
      setReportError('Report service is not configured.');
      return;
    }

    setIsLoadingReports(true);
    setReportError('');
    try {
      const response = await fetch(`${API_URL}/resident/reports`, { headers: { Authorization: `Bearer ${token}` } });
      const result = (await response.json()) as ApiResponse<ApiReport[]>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your reports.');
      setPastReports(result.data || []);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to load your reports.');
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    getSession()
      .then((savedSession) => {
        if (!savedSession) {
          router.replace('/login');
          return;
        }
        if (isMounted) setSession(savedSession);
      })
      .catch(() => router.replace('/login'));
    return () => { isMounted = false; };
  }, [router]);

  useEffect(() => {
    if (session?.token) void loadReports(session.token);
    if (session?.token) void loadSchedule(session.token, session.user.barangay);
  }, [loadReports, loadSchedule, session?.token, session?.user.barangay]);

  useEffect(() => {
    setProfileName(session?.user.name || '');
    setProfilePhone(session?.user.phone || '');
    setProfileBarangay(session?.user.barangay || '');
  }, [session?.user.barangay, session?.user.name, session?.user.phone]);

  const displayName = session?.user.name?.trim() || 'Resident';
  const firstInitial = displayName.charAt(0).toUpperCase();
  const barangay = session?.user.barangay || 'Barangay not set';
  const phone = session?.user.phone || 'Phone number not set';

  const capturePhoto = async () => {
    setReportMessage('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to attach a photo of the uncollected waste.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled) setSelectedPhoto(result.assets[0]);
  };

  const submitReport = async () => {
    if (!session?.token) {
      setReportMessage('Please sign in again before submitting a report.');
      return;
    }
    if (!API_URL) {
      setReportMessage('Report service is not configured.');
      return;
    }
    if (!selectedPhoto) {
      setReportMessage('Take a photo before submitting your report.');
      return;
    }
    if (selectedPhoto.fileSize && selectedPhoto.fileSize > 5 * 1024 * 1024) {
      setReportMessage('Choose a photo smaller than 5 MB.');
      return;
    }
    if (selectedPhoto.mimeType && !['image/jpeg', 'image/png', 'image/webp'].includes(selectedPhoto.mimeType)) {
      setReportMessage('Use a JPEG, PNG, or WebP photo for this report.');
      return;
    }

    setIsSubmitting(true);
    setReportMessage('');
    try {
      const formData = new FormData();
      formData.append('description', description.trim());
      formData.append('photo', {
        uri: selectedPhoto.uri,
        name: selectedPhoto.fileName || 'missed-collection.jpg',
        type: selectedPhoto.mimeType || 'image/jpeg',
      } as unknown as Blob);

      const response = await fetch(`${API_URL}/resident/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData,
      });
      const result = (await response.json()) as ApiResponse<ApiReport>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to submit your report.');

      setSelectedPhoto(null);
      setDescription('');
      setReportMessage('Report submitted. We will review it shortly.');
      await loadReports(session.token);
    } catch (error) {
      setReportMessage(error instanceof Error ? error.message : 'Unable to submit your report.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProfile = async () => {
    if (!session?.token) {
      setProfileMessage('Please sign in again before updating your profile.');
      return;
    }
    if (!API_URL) {
      setProfileMessage('Profile service is not configured.');
      return;
    }
    if (!profileName.trim()) {
      setProfileMessage('Name is required.');
      return;
    }

    setIsSavingProfile(true);
    setProfileMessage('');
    try {
      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          barangay: profileBarangay.trim(),
        }),
      });
      const result = (await response.json()) as ApiResponse<AuthSession['user']>;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Unable to update your profile.');
      }

      const updatedSession = { token: session.token, user: result.data };
      await saveSession(updatedSession);
      setSession(updatedSession);
      setIsEditingProfile(false);
      setProfileMessage('Profile updated.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to update your profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const signOut = async () => {
    await clearSession();
    setSession(null);
    setSchedule(null);
    setPastReports([]);
    setSelectedPhoto(null);
    setDescription('');
    setReportMessage('');
    setIsEditingProfile(false);
    setProfileMessage('');
    router.replace('/login');
  };

  const currentWeekDates = getCurrentWeekDates();
  const upcomingByDate = new Map((schedule?.upcomingCollections || []).map((collection) => [dateKey(collection.date), collection]));
  const currentWeekStart = new Date(currentWeekDates[0]);
  currentWeekStart.setHours(0, 0, 0, 0);
  const currentWeekEnd = new Date(currentWeekDates[currentWeekDates.length - 1]);
  currentWeekEnd.setHours(23, 59, 59, 999);
  const weeklyCollections = (schedule?.upcomingCollections || []).filter((collection) => {
    const date = new Date(collection.date);
    return date >= currentWeekStart && date <= currentWeekEnd;
  });
  const todayCollection = upcomingByDate.get(dateKey(new Date()));
  const nextCollection = schedule?.routes[0];

  const homeScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.greeting}>Good morning,</Text>
      <Text style={styles.name}>{displayName}</Text>
      <Text style={styles.location}>{barangay} · {CITY}</Text>

      <Card style={styles.nextCollectionCard}>
        <Text style={styles.darkCardEyebrow}>NEXT COLLECTION</Text>
        {isLoadingSchedule ? <ActivityIndicator color="#ffffff" style={styles.scheduleLoader} /> : nextCollection ? <>
          <Text style={styles.nextDate}>{formatDate(nextCollection.nextCollection, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          <View style={styles.nextInfoRow}><WastePill type={toWasteLabel(nextCollection.nextWasteType)} /><Text style={styles.nextTime}>{formatTime(nextCollection.nextCollection)}</Text></View>
        </> : <Text style={styles.nextDate}>{scheduleError ? 'Schedule unavailable' : 'No upcoming collection'}</Text>}
        <View style={styles.darkDivider} />
        <Text style={styles.reminder}>Segregate food waste, garden waste, and paper into green bags.</Text>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardHeading}>WEEKLY SCHEDULE</Text>
        {isLoadingSchedule ? <ActivityIndicator color="#07815f" style={styles.loadingSchedule} /> : scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : weeklyCollections.length ? weeklyCollections.map((collection) => <View key={collection.date} style={styles.weeklyRow}><Text style={styles.rowDay}>{collection.dayName}</Text><WastePill type={toWasteLabel(collection.wasteType)} /></View>) : <Text style={styles.emptyScheduleText}>No collections scheduled this week.</Text>}
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTopRow}><Text style={styles.cardHeading}>MY RECENT REPORTS</Text><Pressable onPress={() => setActiveTab('report')}><Text style={styles.viewAll}>View All</Text></Pressable></View>
        {isLoadingReports ? <ActivityIndicator color="#07815f" style={styles.loadingReports} /> : reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : <ReportList reports={pastReports.slice(0, 2)} />}
      </Card>
    </ScrollView>
  );

  const scheduleScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Collection Schedule</Text>
      <Text style={styles.screenSubtitle}>{barangay} · {formatDate(currentWeekDates[0], { month: 'long', year: 'numeric' })}</Text>

      <Card style={styles.card}>
        <Text style={styles.cardHeading}>THIS WEEK</Text>
        {isLoadingSchedule ? <ActivityIndicator color="#07815f" style={styles.loadingSchedule} /> : scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : <>
          <View style={styles.calendarDays}>{currentWeekDates.map((date) => <Text key={dateKey(date)} style={styles.calendarDay}>{date.toLocaleDateString('en-PH', { weekday: 'short' }).slice(0, 1)}</Text>)}</View>
          <View style={styles.calendarDates}>{currentWeekDates.map((date) => {
            const collection = upcomingByDate.get(dateKey(date));
            const isToday = dateKey(date) === dateKey(new Date());
            const isNonBio = collection?.wasteType === 'non-biodegradable';
            return <View key={dateKey(date)} style={[styles.dateCell, collection && (isNonBio ? styles.nonBioCollectionDateCell : styles.collectionDateCell), isToday && styles.currentDateCell]}><Text style={[styles.dateText, isToday && styles.currentDateText]}>{date.getDate()}</Text>{collection ? <View style={[styles.collectionDot, isNonBio && styles.nonBioCollectionDot, isToday && styles.currentCollectionDot]} /> : null}</View>;
          })}</View>
        </>}
        <View style={styles.calendarLegend}><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendBio]} /><Text style={styles.legendText}>Biodegradable</Text></View><View style={styles.legendItem}><View style={[styles.legendDot, styles.legendNonBio]} /><Text style={styles.legendText}>Non-Biodegradable</Text></View></View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardHeading}>UPCOMING COLLECTIONS</Text>
        {isLoadingSchedule ? <ActivityIndicator color="#07815f" style={styles.loadingSchedule} /> : scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : schedule?.upcomingCollections.length ? schedule.upcomingCollections.map((collection) => <View key={collection.date} style={[styles.upcomingRow, collection.wasteType === 'biodegradable' ? styles.upcomingBio : styles.upcomingNonBio]}><View><Text style={styles.collectionDate}>{formatDate(collection.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text><Text style={styles.collectionTime}>Collection at {formatTime(collection.date)}</Text></View><WastePill type={toWasteLabel(collection.wasteType)} /></View>) : <Text style={styles.emptyScheduleText}>No upcoming collections found.</Text>}
      </Card>
    </ScrollView>
  );

  const reportScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Report Issue</Text>
      <Text style={styles.screenSubtitle}>Photo-verified uncollected waste reports</Text>

      <Card style={styles.reportCard}>
        <Text style={styles.cardHeading}>PREVIEW &amp; SUBMIT</Text>
        <Pressable accessibilityRole="button" onPress={capturePhoto} style={[styles.photoPreview, !selectedPhoto && styles.photoEmpty]}>
          {selectedPhoto ? <Image source={{ uri: selectedPhoto.uri }} style={styles.photoImage} /> : <View style={styles.photoEmptyContent}><View style={styles.cameraIcon}><Feather color="#07815f" name="camera" size={24} /></View><Text style={styles.photoEmptyTitle}>Take a photo of the waste</Text><Text style={styles.photoEmptySubtext}>This photo is used to verify your report.</Text></View>}
          {selectedPhoto ? <View style={styles.locationTag}><Feather color="#ffffff" name="map-pin" size={12} /><Text style={styles.locationTagText}>{barangay}</Text></View> : null}
        </Pressable>
        <Text style={styles.fieldLabel}>Brief note (optional)</Text>
        <TextInput multiline onChangeText={setDescription} placeholder="Add details for the collection team" placeholderTextColor="#9aa69f" style={styles.descriptionInput} value={description} />
        {reportMessage ? <Text accessibilityRole="alert" style={reportMessage.includes('submitted') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text> : null}
        <View style={styles.reportButtonRow}><Pressable onPress={capturePhoto} style={styles.retakeButton}><Text style={styles.retakeText}>{selectedPhoto ? 'Retake' : 'Take Photo'}</Text></Pressable><Pressable disabled={isSubmitting} onPress={submitReport} style={[styles.submitButton, isSubmitting && styles.disabledButton]}>{isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitButtonText}>Submit Report</Text>}</Pressable></View>
      </Card>

      <Card style={styles.card}>
        <Text style={styles.cardHeading}>PAST REPORTS</Text>
        {isLoadingReports ? <ActivityIndicator color="#07815f" style={styles.loadingReports} /> : null}
        {reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : null}
        {!isLoadingReports && !reportError ? <ReportList reports={pastReports} /> : null}
      </Card>
    </ScrollView>
  );

  const profileScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Card style={styles.profileCard}>
        {isEditingProfile ? <>
          <Text style={styles.profileEditTitle}>Edit Profile</Text>
          <Text style={styles.profileFieldLabel}>Full Name</Text>
          <TextInput autoCapitalize="words" onChangeText={setProfileName} style={styles.profileInput} value={profileName} />
          <Text style={styles.profileFieldLabel}>Phone Number</Text>
          <TextInput keyboardType="phone-pad" onChangeText={setProfilePhone} style={styles.profileInput} value={profilePhone} />
          <Text style={styles.profileFieldLabel}>Barangay</Text>
          <BarangayPicker onChange={setProfileBarangay} value={profileBarangay} />
          {profileMessage ? <Text accessibilityRole="alert" style={profileMessage === 'Profile updated.' ? styles.successMessage : styles.errorMessage}>{profileMessage}</Text> : null}
          <View style={styles.profileEditActions}>
            <Pressable disabled={isSavingProfile} onPress={() => { setIsEditingProfile(false); setProfileMessage(''); }} style={styles.profileCancelButton}><Text style={styles.profileCancelText}>Cancel</Text></Pressable>
            <Pressable disabled={isSavingProfile} onPress={saveProfile} style={[styles.profileSaveButton, isSavingProfile && styles.disabledButton]}>{isSavingProfile ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.profileSaveText}>Save Changes</Text>}</Pressable>
          </View>
        </> : <>
          <View style={styles.avatar}><Text style={styles.avatarText}>{firstInitial}</Text></View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profilePhone}>{phone}</Text>
          <Text style={styles.profileLocation}>{barangay}, {CITY}</Text>
          <Pressable accessibilityRole="button" onPress={() => { setProfileMessage(''); setIsEditingProfile(true); }} style={styles.editProfileButton}><Feather color="#07815f" name="edit-2" size={14} /><Text style={styles.editProfileText}>Edit Profile</Text></Pressable>
          {profileMessage ? <Text style={styles.successMessage}>{profileMessage}</Text> : null}
        </>}
      </Card>

      <Card style={styles.menuCard}>
        {[{ label: 'Notifications', icon: 'bell' }, { label: 'Collection Schedule', icon: 'calendar' }, { label: 'Privacy Policy', icon: 'shield' }, { label: 'Contact SWMO', icon: 'flag' }].map((item) => <Pressable accessibilityRole="button" key={item.label} style={styles.menuRow}><Feather color="#6d8175" name={item.icon as 'bell' | 'calendar' | 'shield' | 'flag'} size={17} /><Text style={styles.menuText}>{item.label}</Text><Feather color="#a9b5af" name="chevron-right" size={18} /></Pressable>)}
      </Card>

      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}><Feather color="#e23d4f" name="log-out" size={17} /><Text style={styles.signOutText}>Sign Out</Text></Pressable>
    </ScrollView>
  );

  const tabScreen = useMemo(() => ({ home: homeScreen, schedule: scheduleScreen, report: reportScreen, profile: profileScreen })[activeTab], [activeTab, homeScreen, profileScreen, reportScreen, scheduleScreen]);

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.safeArea}>
      <StatusBar backgroundColor="transparent" style="light" translucent />
      <View style={[styles.residentHeader, { paddingTop: insets.top }]}>
        {showBanner && todayCollection ? <View style={styles.bannerWrap}><CollectionBanner barangay={barangay} collection={todayCollection} onDismiss={() => setShowBanner(false)} /></View> : null}
      </View>
      <View style={styles.content}>{tabScreen}</View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f5' },
  residentHeader: { backgroundColor: '#064b37' },
  bannerWrap: { paddingHorizontal: 12, paddingVertical: 6 },
  collectionBanner: { alignItems: 'center', backgroundColor: '#06a86c', borderRadius: 13, flexDirection: 'row', minHeight: 53, paddingHorizontal: 13, shadowColor: '#075b3d', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.18, shadowRadius: 10 },
  bannerCheck: { alignItems: 'center', borderColor: '#c7ffe6', borderRadius: 10, borderWidth: 1, height: 18, justifyContent: 'center', width: 18 },
  bannerTextWrap: { flex: 1, marginLeft: 9 },
  bannerTitle: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  bannerSubtitle: { color: '#d9ffec', fontSize: 10, marginTop: 2 },
  content: { flex: 1 },
  scrollContent: { padding: 13, paddingBottom: 98 },
  greeting: { color: '#5d7066', fontSize: 13, marginTop: 2 },
  name: { color: '#20372a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  location: { color: '#809087', fontSize: 11, marginTop: 3 },
  screenTitle: { color: '#1f382a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  screenSubtitle: { color: '#74847b', fontSize: 11, marginTop: 4 },
  card: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  nextCollectionCard: { backgroundColor: '#126b4c', borderRadius: 16, marginTop: 13, padding: 14, shadowColor: '#0b4c36', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.14, shadowRadius: 10 },
  darkCardEyebrow: { color: '#b9e6d3', fontSize: 10, fontWeight: '800' },
  nextDate: { color: '#ffffff', fontSize: 18, fontWeight: '800', marginTop: 7 },
  scheduleLoader: { marginTop: 12 },
  nextInfoRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginTop: 9 },
  nextTime: { color: '#c6e5d6', fontSize: 11 },
  darkDivider: { backgroundColor: 'rgba(203,239,220,0.20)', height: 1, marginTop: 12 },
  reminder: { color: '#b7dacb', fontSize: 10, lineHeight: 15, marginTop: 10 },
  cardHeading: { color: '#61746a', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  viewAll: { color: '#07815f', fontSize: 10, fontWeight: '800' },
  loadingSchedule: { marginTop: 14 },
  emptyScheduleText: { color: '#89978f', fontSize: 11, marginTop: 13 },
  weeklyRow: { alignItems: 'center', borderBottomColor: '#eff2f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 36 },
  rowDay: { color: '#34483d', fontSize: 12, fontWeight: '600' },
  wastePill: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 3, paddingHorizontal: 8, paddingVertical: 4 },
  bioPill: { backgroundColor: '#e7faef' },
  nonBioPill: { backgroundColor: '#eaf3ff' },
  wastePillText: { fontSize: 9, fontWeight: '800' },
  bioPillText: { color: '#07815f' },
  nonBioPillText: { color: '#2f70d7' },
  recentReportRow: { alignItems: 'center', borderBottomColor: '#eff2f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54 },
  reportMain: { flex: 1, paddingRight: 10 },
  reportLocation: { color: '#31443a', fontSize: 11, fontWeight: '700' },
  reportMeta: { color: '#9aa69f', fontSize: 9, marginTop: 3 },
  reportDescription: { color: '#7a887f', fontSize: 9, marginTop: 3 },
  statusPill: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 4, paddingHorizontal: 8, paddingVertical: 4 },
  scheduledPill: { backgroundColor: '#eaf3ff' },
  resolvedPill: { backgroundColor: '#e7faef' },
  rejectedPill: { backgroundColor: '#fff0f2' },
  statusDot: { borderRadius: 4, height: 5, width: 5 },
  scheduledDot: { backgroundColor: '#2f70d7' },
  resolvedDot: { backgroundColor: '#07815f' },
  rejectedDot: { backgroundColor: '#d44859' },
  statusText: { fontSize: 9, fontWeight: '800' },
  scheduledText: { color: '#2f70d7' },
  resolvedText: { color: '#07815f' },
  rejectedText: { color: '#d44859' },
  calendarDays: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 13 },
  calendarDay: { color: '#78877e', fontSize: 10, textAlign: 'center', width: 31 },
  calendarDates: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 7 },
  dateCell: { alignItems: 'center', borderRadius: 9, height: 37, justifyContent: 'center', width: 31 },
  collectionDateCell: { backgroundColor: '#d8f8e8' },
  nonBioCollectionDateCell: { backgroundColor: '#eaf3ff' },
  currentDateCell: { backgroundColor: '#dceaff' },
  dateText: { color: '#627269', fontSize: 10, fontWeight: '700' },
  currentDateText: { color: '#3475cf' },
  collectionDot: { backgroundColor: '#10a875', borderRadius: 3, height: 4, marginTop: 3, width: 4 },
  nonBioCollectionDot: { backgroundColor: '#4689e1' },
  currentCollectionDot: { backgroundColor: '#4689e1' },
  calendarLegend: { borderTopColor: '#edf1ef', borderTopWidth: 1, flexDirection: 'row', gap: 14, marginTop: 12, paddingTop: 10 },
  legendItem: { alignItems: 'center', flexDirection: 'row', gap: 5 },
  legendDot: { borderRadius: 4, height: 7, width: 7 },
  legendBio: { backgroundColor: '#90e8c1' },
  legendNonBio: { backgroundColor: '#b9d3fb' },
  legendText: { color: '#84928a', fontSize: 9 },
  upcomingRow: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10 },
  upcomingBio: { backgroundColor: '#f0fcf6', borderColor: '#cbf2dd', borderWidth: 1 },
  upcomingNonBio: { backgroundColor: '#f5f9ff', borderColor: '#d9e8ff', borderWidth: 1 },
  collectionDate: { color: '#2d4538', fontSize: 12, fontWeight: '800' },
  collectionTime: { color: '#9aa69f', fontSize: 10, marginTop: 4 },
  reportCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  photoPreview: { borderRadius: 12, height: 176, marginTop: 10, overflow: 'hidden', position: 'relative' },
  photoEmpty: { alignItems: 'center', backgroundColor: '#f3faf6', borderColor: '#bfe8d0', borderStyle: 'dashed', borderWidth: 1.5, justifyContent: 'center' },
  photoImage: { height: '100%', width: '100%' },
  photoEmptyContent: { alignItems: 'center', paddingHorizontal: 20 },
  cameraIcon: { alignItems: 'center', backgroundColor: '#dff7e9', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  photoEmptyTitle: { color: '#315043', fontSize: 13, fontWeight: '800', marginTop: 8 },
  photoEmptySubtext: { color: '#7a8d82', fontSize: 10, marginTop: 4, textAlign: 'center' },
  locationTag: { alignItems: 'center', backgroundColor: 'rgba(24,43,35,0.78)', borderRadius: 10, bottom: 8, flexDirection: 'row', gap: 4, left: 8, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute' },
  locationTagText: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  fieldLabel: { color: '#61746a', fontSize: 11, fontWeight: '700', marginTop: 12 },
  descriptionInput: { backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 11, borderWidth: 1, color: '#243f31', fontSize: 12, marginTop: 6, minHeight: 55, padding: 10, textAlignVertical: 'top' },
  reportButtonRow: { flexDirection: 'row', gap: 9, marginTop: 11 },
  retakeButton: { alignItems: 'center', borderColor: '#dce5e0', borderRadius: 12, borderWidth: 1, flex: 1, height: 42, justifyContent: 'center' },
  retakeText: { color: '#3c5145', fontSize: 12, fontWeight: '800' },
  submitButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, flex: 1.25, height: 42, justifyContent: 'center' },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  successMessage: { color: '#07815f', fontSize: 11, fontWeight: '600', marginTop: 9 },
  errorMessage: { color: '#cc4251', fontSize: 11, fontWeight: '600', lineHeight: 15, marginTop: 9 },
  loadingReports: { marginTop: 14 },
  emptyReportText: { color: '#89978f', fontSize: 11, marginTop: 13 },
  pastReportRow: { alignItems: 'center', borderBottomColor: '#eff2f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62 },
  reportThumbnail: { alignItems: 'center', backgroundColor: '#f2f7f4', borderRadius: 8, height: 44, justifyContent: 'center', marginRight: 9, overflow: 'hidden', width: 44 },
  reportThumbnailImage: { height: '100%', width: '100%' },
  profileCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, padding: 18, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  avatar: { alignItems: 'center', backgroundColor: '#0c8765', borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  avatarText: { color: '#ffffff', fontSize: 22, fontWeight: '800' },
  profileName: { color: '#2c4135', fontSize: 16, fontWeight: '800', marginTop: 10 },
  profilePhone: { color: '#6f8177', fontSize: 10, marginTop: 4 },
  profileLocation: { color: '#829087', fontSize: 10, marginTop: 3 },
  editProfileButton: { alignItems: 'center', flexDirection: 'row', gap: 5, marginTop: 12 },
  editProfileText: { color: '#07815f', fontSize: 11, fontWeight: '800' },
  profileEditTitle: { color: '#2c4135', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  profileFieldLabel: { alignSelf: 'stretch', color: '#61746a', fontSize: 11, fontWeight: '700', marginTop: 10 },
  profileInput: { alignSelf: 'stretch', backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 10, borderWidth: 1, color: '#243f31', fontSize: 12, height: 40, marginTop: 5, paddingHorizontal: 10 },
  profileEditActions: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 14 },
  profileCancelButton: { alignItems: 'center', borderColor: '#dce5e0', borderRadius: 10, borderWidth: 1, flex: 1, height: 40, justifyContent: 'center' },
  profileCancelText: { color: '#3c5145', fontSize: 11, fontWeight: '800' },
  profileSaveButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 10, flex: 1.3, height: 40, justifyContent: 'center' },
  profileSaveText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  menuCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, paddingHorizontal: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  menuRow: { alignItems: 'center', borderBottomColor: '#edf1ef', borderBottomWidth: 1, flexDirection: 'row', minHeight: 52 },
  menuText: { color: '#34483d', flex: 1, fontSize: 12, fontWeight: '600', marginLeft: 11 },
  signOutButton: { alignItems: 'center', borderColor: '#ffdadd', borderRadius: 13, borderWidth: 1, flexDirection: 'row', gap: 7, height: 45, justifyContent: 'center', marginTop: 13 },
  signOutText: { color: '#e23d4f', fontSize: 12, fontWeight: '800' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#e2e9e5', borderTopWidth: 1, flexDirection: 'row', height: 70, paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1 },
  navText: { color: '#99a7a0', fontSize: 9, fontWeight: '600', marginTop: 3 },
  navTextActive: { color: '#008c68', fontWeight: '800' },
  navIndicator: { backgroundColor: '#008c68', borderRadius: 3, height: 3, marginTop: 4, width: 4 },
  navIndicatorPlaceholder: { height: 3, marginTop: 4, width: 4 },
});
