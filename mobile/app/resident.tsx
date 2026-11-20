import { AppSelect } from '@/components/app-select';
import { WASTE_CATEGORY_OPTIONS, wasteCategoryLabel } from '@/lib/waste-categories';
import { useNetworkRecovery } from '@/hooks/use-network-recovery';
import { useAppTheme } from '@/hooks/app-preferences';
import { requestJson } from '@/lib/network-request';
import { ResidentProfileEditor } from '@/components/resident-profile-editor';
import { ResidentAvatar } from '@/components/resident-avatar';
import { ResidentComplaintConversation } from '@/components/resident-complaint-conversation';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { io } from 'socket.io-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText as Text } from '@/components/app-text';
import { MotionPressable as Pressable, MotionModal as Modal, TabTransition, useSlidingTabPill, useClosingValue, RevealRow, useFirstLoadReveal, ToastMotion, MotionChevron, AccordionBody } from '@/components/app-motion';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { PrivacyPolicyModal } from '@/components/signup-privacy';
import { ResidentSettingsModal } from '@/components/resident-settings-modal';
import { SegregationGuide } from '@/components/segregation-guide';
import { SkeletonBlock, SkeletonRegion, SkeletonRows, useSkeletonVisible } from '@/components/loading-skeleton';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from 'heroui-native';
import { House, MessageCircleWarning, Newspaper, UserRound } from 'lucide-react-native';
import { BrandMark } from '@/components/brand-mark';
import { cancelScheduledCollectionReminders, scheduleCollectionReminders, setCollectionReminderPreference } from '@/lib/notifications';
import { clearSession, getSession, saveSession, type AuthSession } from '@/lib/session';
import { type ApiWasteType, type LegacyScheduleData, type ScheduleData, type UpcomingCollection } from '@/types/resident-schedule';
import {
  clearPendingCameraContext,
  getPendingCameraContext,
  savePendingCameraContext,
} from '@/lib/camera-recovery';
import { optimizeProofPhoto, proofCameraOptions } from '@/lib/proof-photo';
import { registerResidentPush } from '@/lib/resident-push';

type ResidentTab = 'home' | 'schedule' | 'report' | 'profile';

type ResidentReference = {
  _id?: string;
  id?: string;
};

type ApiReport = {
  wasteCategory?: string;
  _id: string;
  residentId?: string | ResidentReference;
  barangay: string;
  description: string;
  photoUrl?: string | null;
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
  aiVerified?: boolean;
  aiConfidence?: number;
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

type ApiReportMessage = {
  _id: string;
  body: string;
  senderRole: 'resident' | 'admin';
  senderId?: string | ResidentReference & { name?: string };
  createdAt: string;
};

type Announcement = { id: string; imageUrl?: string | null; message: string; type: string; reason: string; areaId?: string | null; areaLabel: string; scheduledFor: string; publishedAt?: string; affectsMyArea?: boolean; hasArea?: boolean };
type AnnouncementPage = { items: Announcement[]; nextCursor?: string | null; hasMore?: boolean };

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.replace(/\/$/, '') || API_URL?.replace(/\/api\/?$/, '');
const CITY = 'Naga City';

const CITY_NEWS = [
  {
    id: 'swmo-denr-may-2026',
    category: 'Solid Waste Management Office',
    headline: 'DENR Secretary & Mayor Leni Address Naga City Solid Waste Concerns',
    date: 'May 22, 2026',
    excerpt: 'The City Solid Waste Management Office (SWMO), headed by Engr. Joel P. Martin, met with DENR Secretary Mitch Cuna and Mayor Leni at the San Isidro Sanitary Landfill...',
    image: require('../assets/images/naga-swmo-news.jpg'),
  },
] as const;

type SocketStatus = 'connecting' | 'connected' | 'disconnected' | 'unavailable';

type ComplaintSocketPayload = {
  reportId?: string;
  status?: ApiReport['status'];
  report?: Partial<ApiReport>;
  message?: ApiReportMessage;
};

type WasteLabel = 'Biodegradable' | 'Non-Biodegradable';

function toWasteLabel(type?: ApiWasteType | null): WasteLabel {
  return type === 'non-biodegradable' ? 'Non-Biodegradable' : 'Biodegradable';
}

function formatDate(value: string | Date | null | undefined, options: Intl.DateTimeFormatOptions) {
  if (!value) return 'No upcoming collection';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleString('en-PH', options);
}

function formatFileSize(bytes?: number | null) {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getMonthWeeks(month: Date) {
  const firstDay = startOfMonth(month);
  const gridStart = new Date(firstDay);
  gridStart.setDate(firstDay.getDate() - firstDay.getDay());

  const lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0);
  const gridEnd = new Date(lastDay);
  gridEnd.setDate(lastDay.getDate() + (6 - lastDay.getDay()));

  const weeks: Date[][] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    weeks.push(Array.from({ length: 7 }, (_, index) => {
      const date = new Date(cursor);
      date.setDate(cursor.getDate() + index);
      return date;
    }));
    cursor.setDate(cursor.getDate() + 7);
  }
  return weeks;
}

function getDetectedBagCount(report: ApiReport) {
  const count = report.detectedBagCount
    ?? report.bagCount
    ?? report.aiResult?.detectedBagCount
    ?? report.aiResult?.bagCount;

  return typeof count === 'number' ? `${count} bag${count === 1 ? '' : 's'}` : 'Not available';
}

function getReportSubject(report: ApiReport) {
  const firstLine = (report.description || '').split(/\r?\n/)[0]?.trim();
  return firstLine || 'Uncollected waste report';
}

function getReportBody(report: ApiReport) {
  const lines = (report.description || '').split(/\r?\n/);
  const body = lines.slice(1).join('\n').trim();
  return body || lines[0]?.trim() || 'No message provided.';
}

function normalizeId(value: unknown): string {
  if (!value) return '';
  if (typeof value === 'object') {
    const reference = value as ResidentReference;
    return normalizeId(reference._id || reference.id);
  }
  return String(value);
}

function mergeRealtimeReport(reports: ApiReport[], payload: ComplaintSocketPayload): ApiReport[] {
  const incomingReport = payload.report || {};
  const reportId = normalizeId(incomingReport._id || payload.reportId);
  if (!reportId) return reports;

  const nextReport = {
    ...incomingReport,
    _id: reportId,
    status: incomingReport.status || payload.status || 'pending',
  } as ApiReport;
  const existingIndex = reports.findIndex((report) => normalizeId(report._id) === reportId);
  if (existingIndex === -1) return [nextReport, ...reports];

  return reports.map((report, index) => index === existingIndex ? { ...report, ...nextReport } : report);
}

function mergeReportMessages(messages: ApiReportMessage[], incoming?: ApiReportMessage | null): ApiReportMessage[] {
  if (!incoming?._id) return messages;
  if (messages.some((message) => normalizeId(message._id) === normalizeId(incoming._id))) return messages;
  return [...messages, incoming].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());
}

function realtimeStatusText(status: SocketStatus) {
  return status === 'connected'
    ? 'Live updates connected'
    : status === 'connecting'
      ? 'Connecting live updates'
      : status === 'unavailable'
        ? 'Live updates unavailable'
        : 'Live updates disconnected';
}

function normalizeScheduleData(data: ScheduleData | LegacyScheduleData | null, fallbackLocation: string): ScheduleData | null {
  if (!data) return null;
  if ('schedules' in data) return data;

  const route = data.routes[0];
  const biodegradableDays = (route?.weeklyPattern || []).filter((day) => !['Thursday', 'Sunday'].includes(day));
  const nonBiodegradableDays = (route?.weeklyPattern || []).filter((day) => ['Thursday', 'Sunday'].includes(day));
  const schedules: ScheduleData['schedules'] = [];
  if (biodegradableDays.length) schedules.push({ wasteType: 'biodegradable', days: biodegradableDays, timeWindows: [] });
  if (nonBiodegradableDays.length) schedules.push({ wasteType: 'non-biodegradable', days: nonBiodegradableDays, timeWindows: [] });

  return {
    location: data.barangay || fallbackLocation,
    area: 'Legacy route',
    shift: 'day',
    today: data.today,
    todayWasteType: route?.todayWasteType || null,
    nextCollection: route?.nextCollection || null,
    nextWasteType: route?.nextWasteType || null,
    schedules,
    upcomingCollections: data.upcomingCollections.map((collection) => ({
      date: collection.date,
      dayName: collection.dayName,
      wasteType: collection.wasteType,
      timeWindows: [],
    })),
  };
}

function WastePill({ type, hero = false }: { type: 'Biodegradable' | 'Non-Biodegradable'; hero?: boolean }) {
  const biodegradable = type === 'Biodegradable';
  return (
    <View style={[styles.wastePill, biodegradable ? styles.bioPill : styles.nonBioPill, hero && styles.heroWastePill]}>
      <MaterialCommunityIcons color={hero ? '#FFFFFF' : biodegradable ? '#086B42' : '#1A56C4'} name={biodegradable ? 'leaf' : 'recycle'} size={16} />
      <Text style={[styles.wastePillText, biodegradable ? styles.bioPillText : styles.nonBioPillText, hero && styles.heroWasteText]}>{type}</Text>
    </View>
  );
}

function MonthlyScheduleCalendar({ collections }: { collections: UpcomingCollection[] }) {
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [isExpanded, setIsExpanded] = useState(false);
  const monthWeeks = useMemo(() => getMonthWeeks(visibleMonth), [visibleMonth]);
  const eventByDate = useMemo(() => new Map(collections.map((collection) => [dateKey(collection.date), collection])), [collections]);
  const selectedWeek = monthWeeks.find((week) => week.some((date) => dateKey(date) === dateKey(selectedDate))) || monthWeeks[0];
  const visibleWeeks = isExpanded ? monthWeeks : [selectedWeek];
  const selectedCollection = eventByDate.get(dateKey(selectedDate));
  const monthLabel = visibleMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const changeMonth = (offset: number) => {
    const nextMonth = new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + offset, 1);
    setVisibleMonth(nextMonth);
    setSelectedDate(nextMonth);
  };

  const selectDate = (date: Date) => {
    setSelectedDate(date);
    if (date.getMonth() !== visibleMonth.getMonth() || date.getFullYear() !== visibleMonth.getFullYear()) {
      setVisibleMonth(startOfMonth(date));
    }
  };

  return (
    <Card style={styles.calendarCard}>
      <View style={styles.calendarHeader}>
        <Text style={styles.calendarMonthTitle}>{monthLabel}</Text>
        <View style={styles.calendarHeaderActions}>
          <Pressable accessibilityLabel="Previous month" hitSlop={10} onPress={() => changeMonth(-1)} style={styles.calendarHeaderButton}>
            <Feather color="#315043" name="chevron-left" size={24} />
          </Pressable>
          <Pressable accessibilityLabel="Next month" hitSlop={10} onPress={() => changeMonth(1)} style={styles.calendarHeaderButton}>
            <Feather color="#315043" name="chevron-right" size={24} />
          </Pressable>
          <Pressable accessibilityLabel={isExpanded ? 'Collapse calendar' : 'Expand calendar'} accessibilityState={{ expanded: isExpanded }} hitSlop={10} onPress={() => setIsExpanded((expanded) => !expanded)} style={styles.calendarHeaderButton}>
            <MotionChevron expanded={isExpanded}><Feather color="#315043" name="chevron-down" size={24} /></MotionChevron>
          </Pressable>
        </View>
      </View>

      <View style={styles.calendarWeekdayRow}>
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, index) => <Text key={`${day}-${index}`} style={styles.calendarWeekday}>{day}</Text>)}
      </View>
      <View style={styles.calendarDivider} />

      <View style={styles.monthGrid}>
        {visibleWeeks.map((week) => (
          <View key={dateKey(week[0])} style={styles.monthWeek}>
            {week.map((date) => {
              const inMonth = date.getMonth() === visibleMonth.getMonth() && date.getFullYear() === visibleMonth.getFullYear();
              const selected = dateKey(date) === dateKey(selectedDate);
              const collection = eventByDate.get(dateKey(date));
              return (
                <Pressable accessibilityLabel={date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' })} accessibilityRole="button" key={dateKey(date)} onPress={() => selectDate(date)} style={styles.monthDateCell}>
                  <View style={[styles.monthDateCircle, selected && styles.monthDateCircleSelected]}>
                    <Text style={[styles.monthDateText, !inMonth && styles.monthDateTextOutside, selected && styles.monthDateTextSelected]}>{date.getDate()}</Text>
                  </View>
                  <View style={[styles.monthEventDot, collection?.wasteType === 'biodegradable' && styles.monthEventDotBio, collection?.wasteType === 'non-biodegradable' && styles.monthEventDotNonBio]} />
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <View style={styles.calendarLegend}>
        <View style={styles.calendarLegendItem}><View style={[styles.monthEventDot, styles.monthEventDotBio]} /><Text style={styles.calendarLegendText}>Biodegradable</Text></View>
        <View style={styles.calendarLegendItem}><View style={[styles.monthEventDot, styles.monthEventDotNonBio]} /><Text style={styles.calendarLegendText}>Non-Biodegradable</Text></View>
      </View>

      <AccordionBody expanded={isExpanded}>
        <View style={styles.selectedCalendarDay}>
          <Feather color="#07815f" name="calendar" size={22} />
          {selectedCollection ? (
            <View style={styles.selectedCalendarEventText}>
              <Text style={styles.selectedCalendarEventDate}>{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}</Text>
              <View style={styles.selectedCalendarEventMeta}><WastePill type={toWasteLabel(selectedCollection.wasteType)} /><Text style={styles.selectedCalendarEventTime}>{selectedCollection.timeWindows.length ? selectedCollection.timeWindows.join(' · ') : 'Time unavailable'}</Text></View>
            </View>
          ) : (
            <Text style={styles.selectedCalendarEmpty}>No events scheduled for {formatDate(selectedDate, { month: 'long', day: 'numeric', year: 'numeric' })}</Text>
          )}
        </View>
      </AccordionBody>
    </Card>
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

function RealtimeStatus({ status }: { status: SocketStatus }) {
  const [visible, setVisible] = useState(true);
  const connectionSkeleton = useSkeletonVisible(status === 'connecting', status === 'connected');

  useEffect(() => {
    setVisible(true);
    if (status === 'connected') {
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [status]);

  if (!visible) return null;

  const statusStyle = status === 'connected'
    ? styles.realtimeConnected
    : status === 'connecting'
      ? styles.realtimeConnecting
      : styles.realtimeDisconnected;

  return (
    <SkeletonRegion state={connectionSkeleton} placeholder={<SkeletonBlock width={150} height={12} />}>
    <View accessibilityLiveRegion="polite" style={[styles.realtimeStatus, statusStyle]}>
      <View style={styles.realtimeStatusDot} />
      <Text style={styles.realtimeStatusText}>{realtimeStatusText(status)}</Text>
    </View>
    </SkeletonRegion>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: ResidentTab; onChange: (tab: ResidentTab) => void }) {
  const insets = useSafeAreaInsets();
  const pill = useSlidingTabPill(activeTab);
  const tabs = [
    { key: 'home' as const, label: 'Home', icon: House },
    { key: 'schedule' as const, label: 'Announcements', icon: Newspaper },
    { key: 'report' as const, label: 'Complaint', icon: MessageCircleWarning },
    { key: 'profile' as const, label: 'Profile', icon: UserRound },
  ];

  return (
    <View style={[styles.bottomNav, { minHeight: 78 + insets.bottom, paddingBottom: insets.bottom }]}>
      {pill.indicator}
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <Pressable motionDisabled onLayout={(event) => pill.itemLayout(tab.key, event)} accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.key} onPress={() => onChange(tab.key)} style={styles.navItem}>
            <View onLayout={(event) => pill.iconLayout(tab.key, event)} style={styles.navIcon}><Icon color={active ? '#086B42' : '#5A6761'} size={22} strokeWidth={1.8} /></View>
            <Text style={[styles.navText, active && styles.navTextActive]}>{tab.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function HomeSectionLabel({ label, onViewAll, first = false }: { label: string; onViewAll?: () => void; first?: boolean }) {
  return (
    <View style={[styles.homeSectionRow, first && styles.homeFirstSection]}>
      <View style={styles.homeSectionContent}>
        <Text style={styles.homeSectionLabel}>{label}</Text>
        {onViewAll ? (
          <Pressable accessibilityRole="button" onPress={onViewAll} style={styles.viewAllButton}>
            <Text style={styles.viewAll}>View All</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function AnnouncementCard({ item }: { item: Announcement }) {
  const isNew = item.publishedAt ? Date.now() - new Date(item.publishedAt).getTime() < 24 * 60 * 60 * 1000 : false;
  const relative = item.publishedAt ? formatDate(item.publishedAt, { month: 'short', day: 'numeric' }) : '';
  return (
    <View style={styles.newsCard}>
      {item.imageUrl ? <ExpoImage accessibilityLabel={`${item.reason} announcement image`} contentFit="cover" source={{ uri: item.imageUrl }} style={styles.newsThumbnail} /> : <View style={[styles.newsThumbnail, styles.announcementArtwork]}><Text style={styles.announcementArtworkText}>SERVICE ADVISORY</Text></View>}
      <View style={styles.newsCopy}><View style={styles.announcementMeta}><Text style={styles.newsCategory}>{item.areaLabel}</Text>{isNew ? <Text style={styles.announcementNew}>NEW</Text> : null}<Text style={styles.newsDate}>{relative}</Text></View><Text style={styles.newsHeadline}>{item.message}</Text></View>
    </View>
  );
}

function ReportList({ reports, onSelect, showPhoto, animate = false }: { reports: ApiReport[]; onSelect: (report: ApiReport) => void; showPhoto?: boolean; animate?: boolean }) {
  if (!reports.length) {
    return <Text style={styles.complaintsEmpty}>No complaints yet. Tap + to message SWMO Support.</Text>;
  }

  return (
    <>
      {reports.map((report, index) => (
        <RevealRow key={report._id} animate={animate} index={index}>
        <Pressable
          accessibilityHint="Opens the complaint conversation"
          accessibilityRole="button"
          key={report._id}
          onPress={() => onSelect(report)}
          style={styles.complaintRowPressable}>
          <View style={styles.complaintRow}>
            {showPhoto ? (
              <View style={styles.reportThumbnail}>
                {report.photoUrl
                  ? <Image source={{ uri: report.photoUrl }} style={styles.reportThumbnailImage} />
                  : <Feather color="#07815f" name="image" size={18} />}
              </View>
            ) : (
              <View style={styles.complaintIcon}><Feather color="#0A7F4F" name="message-circle" size={20} /></View>
            )}
            <View style={styles.complaintCopy}>
              <Text numberOfLines={1} style={styles.complaintSubject}>{getReportSubject(report)}</Text>
              <Text numberOfLines={1} style={styles.complaintPreview}>{formatDate(report.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })} · {getReportBody(report)}</Text>
              <Text style={styles.complaintPreview}>Waste category: {wasteCategoryLabel(report.wasteCategory)}</Text>
              <View style={styles.complaintMeta}><StatusPill status={report.status} /></View>
            </View>
            <Feather color="#5A6761" name="chevron-right" size={20} />
          </View>
        </Pressable>
        </RevealRow>
      ))}
    </>
  );
}

export default function ResidentScreen() {
  const appTheme = useAppTheme();
  const isDarkTheme = appTheme === 'dark';
  const networkRevision = useNetworkRecovery();
  const router = useRouter();
  const { tab, notificationId } = useLocalSearchParams<{ tab?: string; notificationId?: string }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ResidentTab>(tab === 'schedule' ? 'schedule' : 'home');
  useEffect(() => {
    if (tab === 'home' && notificationId) setActiveTab('home');
  }, [notificationId, tab]);
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [isPrivacyVisible, setIsPrivacyVisible] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  useEffect(() => {
    if (API_URL && session?.token) void registerResidentPush(API_URL, session.token)
      .catch(error => console.warn('Resident push registration failed:', error instanceof Error ? error.message : 'Unknown error'));
  }, [session?.token, networkRevision]);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [announcementScope, setAnnouncementScope] = useState<'all' | 'mine'>('all');
  const [announcementCursor, setAnnouncementCursor] = useState<string | null>(null);
  const [announcementHasMore, setAnnouncementHasMore] = useState(false);
  const [announcementLoading, setAnnouncementLoading] = useState(false);
  const [announcementError, setAnnouncementError] = useState('');
  const announcementCursorRef = useRef<string | null>(null);
  const [pastReports, setPastReports] = useState<ApiReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ApiReport | null>(null);
  const closingReport = useClosingValue(selectedReport);
  const reportDetailsOpen = Boolean(selectedReport);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoMetadata, setPhotoMetadata] = useState<ApiReport['photoMetadata'] | null>(null);
  const [aiDetection, setAiDetection] = useState<{
    status: 'idle' | 'scanning' | 'done' | 'error';
    verified?: boolean;
    confidence?: number;
    detectedBagCount?: number;
    predictions?: Array<{ confidence: number; class?: string }>;
    message?: string;
  }>({ status: 'idle' });
  const [reportSubject, setReportSubject] = useState('');
  const [wasteCategory, setWasteCategory] = useState('');
  const [description, setDescription] = useState('');
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCapturingPhoto, setIsCapturingPhoto] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [profilePhotoRemoved, setProfilePhotoRemoved] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [isSettingsVisible, setIsSettingsVisible] = useState(false);
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('unavailable');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const selectedReportIdRef = useRef('');
  const [reportMessages, setReportMessages] = useState<ApiReportMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const scheduleSkeleton = useSkeletonVisible(isLoadingSchedule, Boolean(schedule), scheduleError, session?.user.id);
  const reportsSkeleton = useSkeletonVisible(isLoadingReports, pastReports.length > 0, reportError, session?.user.id);
  const revealReports = useFirstLoadReveal(isLoadingReports, pastReports.length > 0, reportsSkeleton.pending, session?.user._id || session?.user.id);
  const revealSchedule = useFirstLoadReveal(isLoadingSchedule, Boolean(schedule), scheduleSkeleton.pending, session?.user._id || session?.user.id);

  const loadSchedule = useCallback(async (token: string, residentLocation?: string) => {
    if (!residentLocation) {
      setSchedule(null);
      setScheduleError('Add a collection location in your profile to load your schedule.');
      setIsLoadingSchedule(false);
      return;
    }

    setIsLoadingSchedule(true);
    setScheduleError('');
    setShowAllUpcoming(false);

    if (!API_URL) {
      setSchedule(null);
      setScheduleError('Schedule service is not configured.');
      setIsLoadingSchedule(false);
      return;
    }

    try {
      const { response, payload: result } = await requestJson<ApiResponse<ScheduleData | LegacyScheduleData>>(`${API_URL}/resident/schedule`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your collection schedule.');
      const scheduleData = normalizeScheduleData(result.data || null, residentLocation);
      setSchedule(scheduleData);
      if (!scheduleData?.schedules.length) {
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
      const { response, payload: result } = await requestJson<ApiResponse<ApiReport[]>>(`${API_URL}/resident/reports`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load your reports.');
      setPastReports(result.data || []);
    } catch (error) {
      setReportError(error instanceof Error ? error.message : 'Unable to load your reports.');
    } finally {
      setIsLoadingReports(false);
    }
  }, []);

  const loadAnnouncements = useCallback(async (token: string, reset = true) => {
    if (!API_URL) return;
    setAnnouncementLoading(true); setAnnouncementError('');
    try {
      const cursor = reset ? '' : announcementCursorRef.current ? `&cursor=${encodeURIComponent(announcementCursorRef.current)}` : '';
      const { response, payload: result } = await requestJson<ApiResponse<AnnouncementPage>>(`${API_URL}/announcements?scope=${announcementScope}&limit=10${cursor}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Unable to load announcements.');
      setAnnouncements(current => reset ? result.data!.items : [...current, ...result.data!.items]); announcementCursorRef.current = result.data.nextCursor || null; setAnnouncementCursor(result.data.nextCursor || null); setAnnouncementHasMore(Boolean(result.data.hasMore));
    } catch (error) { setAnnouncementError(error instanceof Error ? error.message : 'Unable to load announcements.'); } finally { setAnnouncementLoading(false); }
  }, [announcementScope]);

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
    if (session?.token) void loadSchedule(session.token, session.user.location || session.user.barangay);
    if (session?.token) void loadAnnouncements(session.token);
  }, [loadReports, loadSchedule, loadAnnouncements, session?.token, session?.user.barangay, session?.user.location, networkRevision]);

  // Pre-warm camera permission so the OS dialog never interrupts the camera launch.
  useEffect(() => {
    void ImagePicker.getCameraPermissionsAsync().then((result) => {
      if (result.status === 'undetermined') {
        void ImagePicker.requestCameraPermissionsAsync();
      }
    });
  }, []);

  useEffect(() => {
    let cancelled = false;

    const restorePendingResidentPhoto = async () => {
      try {
        const savedContext = await getPendingCameraContext();
        if (savedContext?.type === 'resident') {
          if (savedContext.wasteCategory) setWasteCategory(savedContext.wasteCategory);
          if (savedContext.category) setReportSubject(savedContext.category);
          if (savedContext.notes) setDescription(savedContext.notes);
          setIsCreatingReport(true);
        }

        const pendingResult = await ImagePicker.getPendingResultAsync();
        if (cancelled) return;

        if (!pendingResult || 'code' in pendingResult || pendingResult.canceled || !pendingResult.assets?.length) {
          if (pendingResult && 'canceled' in pendingResult && pendingResult.canceled) {
            await clearPendingCameraContext();
          }
          return;
        }

        const asset = await optimizeProofPhoto(pendingResult.assets[0]);
        if (!cancelled) {
          setSelectedPhoto(asset);
          setPhotoMetadata({
            capturedAt: new Date().toISOString(),
            width: asset.width,
            height: asset.height,
            fileSize: asset.fileSize,
            mimeType: asset.mimeType || 'image/jpeg',
          });
          setIsCreatingReport(true);
          setReportMessage('Photo proof recovered after returning from camera.');
          await clearPendingCameraContext();
          void runAiScan(asset);
        }
      } catch {
        await clearPendingCameraContext();
        if (!cancelled) {
          setReportMessage('The recovered photo could not be processed. Please take it again.');
        }
      }
    };

    void restorePendingResidentPhoto();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const reportId = selectedReport?._id;
    if (!session?.token || !reportId || !API_URL) {
      setReportMessages([]);
      setMessageError('');
      return undefined;
    }

    let cancelled = false;
    setIsLoadingMessages(true);
    setMessageError('');
    requestJson<ApiResponse<ApiReportMessage[]>>(`${API_URL}/resident/reports/${encodeURIComponent(reportId)}/messages`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(({ response, payload: result }) => {
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load conversation.');
        if (!cancelled) setReportMessages(result.data || []);
      })
      .catch((error) => {
        if (!cancelled) setMessageError(error instanceof Error ? error.message : 'Unable to load conversation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => { cancelled = true; };
  }, [selectedReport?._id, session?.token, networkRevision]);

  useEffect(() => {
    if (tab === 'schedule' || tab === 'announcements' || tab === 'news') setActiveTab('schedule');
  }, [tab]);

  useEffect(() => {
    selectedReportIdRef.current = normalizeId(selectedReport?._id);
  }, [selectedReport?._id]);

  useEffect(() => {
    const token = session?.token;
    const userId = normalizeId(session?.user._id || session?.user.id);
    if (!token) {
      setSocketStatus('disconnected');
      return undefined;
    }
    if (!SOCKET_URL) {
      setSocketStatus('unavailable');
      return undefined;
    }

    setSocketStatus('connecting');
    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    const handleConnect = () => { setSocketStatus('connected'); void loadReports(token); };
    const handleDisconnect = () => setSocketStatus('disconnected');
    const handleConnectError = () => setSocketStatus('disconnected');
    const handleComplaintEvent = (payload: ComplaintSocketPayload) => {
      const incomingReport = payload.report || {};
      const reportId = normalizeId(incomingReport._id || payload.reportId);
      const reportResidentId = normalizeId(incomingReport.residentId);
      if (!reportId || (reportResidentId && userId && reportResidentId !== userId)) return;

      // If the server payload does not identify the resident, use the authenticated
      // REST endpoint so no resident ever receives another resident's report.
      if (!reportResidentId || !userId) {
        void loadReports(token);
        return;
      }

      setPastReports((current) => mergeRealtimeReport(current, payload));
      setSelectedReport((current) => {
        if (!current || normalizeId(current._id) !== reportId) return current;
        return {
          ...current,
          ...incomingReport,
          _id: reportId,
          status: incomingReport.status || payload.status || current.status,
        } as ApiReport;
      });
    };
    const handleMessageEvent = (payload: ComplaintSocketPayload) => {
      const reportId = normalizeId(payload.reportId);
      const selectedId = selectedReportIdRef.current;
      if (!reportId || !selectedId || reportId !== selectedId || !payload.message) return;
      setReportMessages((current) => mergeReportMessages(current, payload.message));
    };
    const handleAnnouncementEvent = (payload: Announcement) => {
      if (!payload?.id) return;
      setAnnouncements(current => current.some(item => item.id === payload.id) ? current : [{ ...payload, affectsMyArea: announcementScope === 'mine' ? true : payload.affectsMyArea }, ...current]);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('complaint:created', handleComplaintEvent);
    socket.on('complaint:status-updated', handleComplaintEvent);
    socket.on('complaint:message-created', handleMessageEvent);
    socket.on('announcement:new', handleAnnouncementEvent);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('complaint:created', handleComplaintEvent);
      socket.off('complaint:status-updated', handleComplaintEvent);
      socket.off('complaint:message-created', handleMessageEvent);
      socket.off('announcement:new', handleAnnouncementEvent);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [announcementScope, loadReports, session?.token, session?.user._id, session?.user.id, networkRevision]);

  useEffect(() => {
    setProfileName(session?.user.name || '');
    setProfilePhone(session?.user.phone || '');
    setProfileLocation(session?.user.location || session?.user.barangay || '');
  }, [session?.user.barangay, session?.user.location, session?.user.name, session?.user.phone]);

  const displayName = session?.user.name?.trim() || 'Resident';
  const location = session?.user.location || session?.user.barangay || 'Location not set';
  const phone = session?.user.phone || 'Phone number not set';

  const sendReportMessage = async () => {
    const body = messageDraft.trim();
    if (!body || !selectedReport?._id || !session?.token || !API_URL || isSendingMessage) return;

    setIsSendingMessage(true);
    setMessageError('');
    try {
      const response = await fetch(`${API_URL}/resident/reports/${encodeURIComponent(selectedReport._id)}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      const result = (await response.json()) as ApiResponse<ApiReportMessage>;
      if (!response.ok || !result.success || !result.data) throw new Error(result.error || 'Unable to send message.');
      setReportMessages((current) => mergeReportMessages(current, result.data));
      setMessageDraft('');
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Unable to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const renderReportDetails = () => {
    const selectedReport = closingReport;
    if (!selectedReport) return null;

    return (
      <Modal animationType="slide" onRequestClose={() => setSelectedReport(null)} transparent visible={reportDetailsOpen}>
        <View style={styles.reportModalBackdrop}>
          <Pressable accessibilityLabel="Close report details" onPress={() => setSelectedReport(null)} style={styles.reportModalDismissArea} />
          <ResidentComplaintConversation
            key={selectedReport._id}
            residentName={displayName} residentPhoto={session?.user.profilePhotoUrl}
            report={selectedReport}
            subject={getReportSubject(selectedReport)}
            body={getReportBody(selectedReport)}
            bags={getDetectedBagCount(selectedReport)}
            metadata={selectedReport.photoMetadata ? [
              selectedReport.photoMetadata.capturedAt ? `Captured ${formatDate(selectedReport.photoMetadata.capturedAt, {dateStyle:'medium',timeStyle:'short'})}` : 'Capture time unavailable',
              selectedReport.photoMetadata.latitude != null && selectedReport.photoMetadata.longitude != null ? `GPS ${Number(selectedReport.photoMetadata.latitude).toFixed(5)}, ${Number(selectedReport.photoMetadata.longitude).toFixed(5)}` : '',
              selectedReport.photoMetadata.width && selectedReport.photoMetadata.height ? `${selectedReport.photoMetadata.width} x ${selectedReport.photoMetadata.height}px` : '',
              selectedReport.photoMetadata.fileSize ? formatFileSize(selectedReport.photoMetadata.fileSize) : '',
            ].filter(Boolean).join(' \u00b7 ') : ''}
            messages={reportMessages} loading={isLoadingMessages} sending={isSendingMessage}
            error={messageError} draft={messageDraft} setDraft={setMessageDraft}
            send={sendReportMessage} onClose={() => setSelectedReport(null)} bottomInset={insets.bottom}
          />
        </View>
      </Modal>
    );
  };

  const runAiScan = async (asset: ImagePicker.ImagePickerAsset) => {
    if (!API_URL || !session?.token) {
      setAiDetection({ status: 'idle' });
      return;
    }
    setAiDetection({ status: 'scanning' });
    try {
      const formData = new FormData();
      const filename = asset.fileName || `waste-${Date.now()}.jpg`;
      const mimeType = asset.mimeType || 'image/jpeg';
      formData.append('photo', {
        uri: asset.uri,
        name: filename,
        type: mimeType,
      } as unknown as Blob);

      const response = await fetch(`${API_URL}/resident/reports/verify-photo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session.token}`,
        },
        body: formData,
      });
      const json = await response.json();
      if (response.ok && json.success && json.data) {
        setAiDetection({
          status: 'done',
          verified: Boolean(json.data.verified),
          confidence: json.data.confidence,
          detectedBagCount: json.data.detectedBagCount,
          predictions: json.data.predictions,
        });
      } else {
        setAiDetection({
          status: 'error',
          message: 'AI verification will be confirmed upon sending the report.',
        });
      }
    } catch {
      setAiDetection({
        status: 'error',
        message: 'AI verification will run when you send the complaint.',
      });
    }
  };

  const capturePhoto = async () => {
    if (isCapturingPhoto) return;
    setReportMessage('');
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Camera permission needed', 'Allow camera access to attach a photo of the uncollected waste.');
        return;
      }

      setIsCapturingPhoto(true);
      await savePendingCameraContext({
        type: 'resident',
        category: reportSubject,
        wasteCategory,
        notes: description,
      });

      const result = await ImagePicker.launchCameraAsync(proofCameraOptions);
      if (!result.canceled && result.assets?.[0]) {
        const asset = await optimizeProofPhoto(result.assets[0]);
        let coordinates: { latitude: number; longitude: number; accuracy?: number } | undefined;
        try {
          const locationPermission = await Location.requestForegroundPermissionsAsync();
          if (locationPermission.granted) {
            const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            coordinates = { latitude: position.coords.latitude, longitude: position.coords.longitude, accuracy: position.coords.accuracy || undefined };
          }
        } catch {
          // Photo submission still works when location permission is denied or unavailable.
        }
        setSelectedPhoto(asset);
        setPhotoMetadata({ capturedAt: new Date().toISOString(), ...coordinates, width: asset.width, height: asset.height, fileSize: asset.fileSize, mimeType: asset.mimeType || 'image/jpeg' });
        await clearPendingCameraContext();
        void runAiScan(asset);
      } else {
        await clearPendingCameraContext();
      }
    } catch (error) {
      await clearPendingCameraContext();
      setReportMessage(error instanceof Error ? error.message : 'Unable to open the camera. Please try again.');
    } finally {
      setIsCapturingPhoto(false);
    }
  };

  const renderPhotoProofSection = () => {
    if (!selectedPhoto) {
      return (
        <Pressable
          accessibilityRole="button"
          disabled={isCapturingPhoto}
          onPress={capturePhoto}
          style={[styles.photoEmptyPicker, isCapturingPhoto && styles.disabledButton]}
        >
          <View style={styles.photoEmptyPickerIcon}>
            {isCapturingPhoto ? (
              <ActivityIndicator color="#07815f" size="small" />
            ) : (
              <Feather color="#07815f" name="camera" size={22} />
            )}
          </View>
          <View style={styles.photoEmptyPickerCopy}>
            <Text style={styles.photoEmptyPickerTitle}>
              {isCapturingPhoto ? 'Opening camera...' : 'Take photo proof'}
            </Text>
            <Text style={styles.photoEmptyPickerSubtitle}>
              Required · helps SWMO verify and locate uncollected waste.
            </Text>
          </View>
          <Feather color="#07815f" name="chevron-right" size={18} />
        </Pressable>
      );
    }

    return (
      <View style={styles.photoPreviewCard}>
        {/* Main Photo Container */}
        <View style={styles.photoImageContainer}>
          <ExpoImage
            accessibilityLabel="Captured waste proof photo"
            contentFit="cover"
            source={{ uri: selectedPhoto.uri }}
            style={styles.photoPreviewImage}
            transition={200}
          />
          {/* Top Badge */}
          <View style={styles.photoTopBadge}>
            <Feather color="#ffffff" name="check-circle" size={12} />
            <Text style={styles.photoTopBadgeText}>Photo attached</Text>
          </View>
          {/* Retake Button Floating on Photo */}
          <Pressable
            accessibilityRole="button"
            disabled={isCapturingPhoto}
            onPress={capturePhoto}
            style={styles.retakeFloatingButton}
          >
            {isCapturingPhoto ? (
              <ActivityIndicator color="#ffffff" size="small" />
            ) : (
              <>
                <Feather color="#ffffff" name="camera" size={13} />
                <Text style={styles.retakeFloatingText}>Retake</Text>
              </>
            )}
          </Pressable>
        </View>

        {/* AI Waste Detection Result Card */}
        <View style={styles.aiResultContainer}>
          {aiDetection.status === 'scanning' ? (
            <View style={styles.aiScanningBanner}>
              <ActivityIndicator color="#07815f" size="small" />
              <View style={styles.aiTextColumn}>
                <Text style={styles.aiScanningTitle}>Analyzing with Detection AI...</Text>
                <Text style={styles.aiScanningSubtext}>Scanning image for waste bags via Roboflow</Text>
              </View>
            </View>
          ) : aiDetection.status === 'done' && aiDetection.verified ? (
            <View style={styles.aiVerifiedBanner}>
              <View style={styles.aiBadgeIconSuccess}>
                <Feather color="#07815f" name="check" size={15} />
              </View>
              <View style={styles.aiTextColumn}>
                <View style={styles.aiTitleRow}>
                  <Text style={styles.aiVerifiedTitle}>Waste Detected by AI</Text>
                  <View style={styles.aiConfidenceBadge}>
                    <Text style={styles.aiConfidenceText}>{Math.round((aiDetection.confidence || 0) * 100)}% Match</Text>
                  </View>
                </View>
                <Text style={styles.aiVerifiedSubtext}>
                  {aiDetection.detectedBagCount
                    ? `${aiDetection.detectedBagCount} waste bag(s) identified in photo`
                    : 'Uncollected waste confirmed'}
                </Text>
              </View>
            </View>
          ) : aiDetection.status === 'done' && !aiDetection.verified ? (
            <View style={styles.aiUnverifiedBanner}>
              <View style={styles.aiBadgeIconWarning}>
                <Feather color="#8d5a1b" name="alert-circle" size={15} />
              </View>
              <View style={styles.aiTextColumn}>
                <Text style={styles.aiUnverifiedTitle}>AI: No waste bags confirmed</Text>
                <Text style={styles.aiUnverifiedSubtext}>Photo attached · SWMO staff will manually review this report</Text>
              </View>
            </View>
          ) : (
            <View style={styles.aiPendingBanner}>
              <Feather color="#527062" name="cpu" size={14} />
              <Text style={styles.aiPendingText}>AI verification will confirm waste on submission</Text>
            </View>
          )}
        </View>

        {/* Photo Metadata Grid */}
        <View style={styles.metadataSection}>
          <View style={styles.metadataHeader}>
            <Feather color="#61746a" name="info" size={12} />
            <Text style={styles.metadataSectionTitle}>PHOTO METADATA</Text>
          </View>
          <View style={styles.metadataGrid}>
            <View style={styles.metadataItem}>
              <View style={styles.metadataIconWrap}>
                <Feather color="#07815f" name="map-pin" size={13} />
              </View>
              <View style={styles.metadataTextWrap}>
                <Text style={styles.metadataLabel}>LOCATION</Text>
                <Text numberOfLines={1} style={styles.metadataValue}>
                  {photoMetadata?.latitude != null && photoMetadata?.longitude != null
                    ? `${photoMetadata.latitude.toFixed(5)}, ${photoMetadata.longitude.toFixed(5)}`
                    : location || 'Naga City'}
                </Text>
                <Text numberOfLines={1} style={styles.metadataCaption}>
                  {photoMetadata?.accuracy != null ? `±${Math.round(photoMetadata.accuracy)}m accuracy` : 'Device GPS'}
                </Text>
              </View>
            </View>

            <View style={styles.metadataItem}>
              <View style={styles.metadataIconWrap}>
                <Feather color="#07815f" name="clock" size={13} />
              </View>
              <View style={styles.metadataTextWrap}>
                <Text style={styles.metadataLabel}>TIMESTAMP</Text>
                <Text numberOfLines={1} style={styles.metadataValue}>
                  {formatDate(photoMetadata?.capturedAt || new Date(), { hour: 'numeric', minute: '2-digit', hour12: true })}
                </Text>
                <Text numberOfLines={1} style={styles.metadataCaption}>
                  {formatDate(photoMetadata?.capturedAt || new Date(), { month: 'short', day: 'numeric', year: 'numeric' })}
                </Text>
              </View>
            </View>

            <View style={styles.metadataItem}>
              <View style={styles.metadataIconWrap}>
                <Feather color="#07815f" name="maximize" size={13} />
              </View>
              <View style={styles.metadataTextWrap}>
                <Text style={styles.metadataLabel}>RESOLUTION</Text>
                <Text numberOfLines={1} style={styles.metadataValue}>
                  {selectedPhoto.width && selectedPhoto.height
                    ? `${selectedPhoto.width} × ${selectedPhoto.height} px`
                    : 'Full resolution'}
                </Text>
                <Text numberOfLines={1} style={styles.metadataCaption}>
                  {(selectedPhoto.mimeType || 'image/jpeg').replace('image/', '').toUpperCase()} format
                </Text>
              </View>
            </View>

            <View style={styles.metadataItem}>
              <View style={styles.metadataIconWrap}>
                <Feather color="#07815f" name="hard-drive" size={13} />
              </View>
              <View style={styles.metadataTextWrap}>
                <Text style={styles.metadataLabel}>FILE SIZE</Text>
                <Text numberOfLines={1} style={styles.metadataValue}>
                  {formatFileSize(selectedPhoto.fileSize || 0)}
                </Text>
                <Text numberOfLines={1} style={styles.metadataCaption}>Original photo</Text>
              </View>
            </View>
          </View>
        </View>
      </View>
    );
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
    if (!reportSubject.trim()) {
      setReportMessage('Add a subject for your complaint.');
      return;
    }
    if (!WASTE_CATEGORY_OPTIONS.some(option => option.value === wasteCategory)) {
      setReportMessage('Select a waste category for your complaint.');
      return;
    }
    if (!description.trim()) {
      setReportMessage('Write a message describing the issue.');
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
      formData.append('wasteCategory', wasteCategory);
      formData.append('description', `${reportSubject.trim()}\n\n${description.trim()}`);
      formData.append('photo', {
        uri: selectedPhoto.uri,
        name: selectedPhoto.fileName || 'missed-collection.jpg',
        type: selectedPhoto.mimeType || 'image/jpeg',
      } as unknown as Blob);
      formData.append('photoMetadata', JSON.stringify(photoMetadata || {
        capturedAt: new Date().toISOString(),
        width: selectedPhoto.width,
        height: selectedPhoto.height,
        fileSize: selectedPhoto.fileSize,
        mimeType: selectedPhoto.mimeType || 'image/jpeg',
      }));

      const response = await fetch(`${API_URL}/resident/reports`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.token}` },
        body: formData,
      });
      const result = (await response.json()) as ApiResponse<ApiReport>;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to submit your report.');

      setSelectedPhoto(null);
      setPhotoMetadata(null);
      setAiDetection({ status: 'idle' });
      setReportSubject('');
      setWasteCategory('');
      setDescription('');
      setIsCreatingReport(false);
      setReportMessage('Complaint sent. SWMO will reply here.');
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
      const fields = {
        name: profileName.trim(), phone: profilePhone.trim(),
        location: profileLocation.trim(), barangay: profileLocation.trim(),
        ...(profilePhotoRemoved ? { profilePhotoUrl: '' } : {}),
      };
      let body: string | FormData = JSON.stringify(fields);
      const headers: Record<string, string> = { Authorization: `Bearer ${session.token}` };
      if (profilePhoto) {
        const form = new FormData();
        Object.entries(fields).forEach(([key, value]) => form.append(key, value));
        if (Platform.OS === 'web') {
          const file = profilePhoto.file || await (await fetch(profilePhoto.uri)).blob();
          form.append('avatar', file, profilePhoto.fileName || 'profile.jpg');
        } else {
          form.append('avatar', { uri: profilePhoto.uri, name: profilePhoto.fileName || 'profile.jpg', type: profilePhoto.mimeType || 'image/jpeg' } as unknown as Blob);
        }
        body = form;
      } else {
        headers['Content-Type'] = 'application/json';
      }
      const response = await fetch(`${API_URL}/auth/me`, { method: 'PATCH', headers, body });
      const result = (await response.json()) as ApiResponse<AuthSession['user']>;
      if (!response.ok || !result.success || !result.data) {
        throw new Error(result.error || 'Unable to update your profile.');
      }

      const updatedSession = { token: session.token, user: result.data };
      await saveSession(updatedSession);
      setSession(updatedSession);
      setIsEditingProfile(false);
      setProfilePhoto(null);
      setProfileMessage('Profile updated.');
    } catch (error) {
      setProfileMessage(error instanceof Error ? error.message : 'Unable to update your profile.');
    } finally {
      setIsSavingProfile(false);
    }
  };

  const completeSignOut = async () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    try {
      await cancelScheduledCollectionReminders();
    } catch {
      // The session is still cleared if local notification cleanup fails.
    }
    await clearSession();
    setSession(null);
    setSchedule(null);
    setPastReports([]);
    setSelectedPhoto(null);
    setPhotoMetadata(null);
    setAiDetection({ status: 'idle' });
    setReportSubject('');
    setDescription('');
    setReportMessage('');
    setIsCreatingReport(false);
    setIsEditingProfile(false);
    setProfileMessage('');
    router.replace('/login');
  };

  const signOut = () => setIsSignOutConfirmVisible(true);

  const currentWeekDates = getCurrentWeekDates();
  const currentWeekStart = new Date(currentWeekDates[0]);
  currentWeekStart.setHours(0, 0, 0, 0);
  const currentWeekEnd = new Date(currentWeekDates[currentWeekDates.length - 1]);
  currentWeekEnd.setHours(23, 59, 59, 999);
  const weeklyCollections = (schedule?.upcomingCollections || []).filter((collection) => {
    const date = new Date(collection.date);
    return date >= currentWeekStart && date <= currentWeekEnd;
  });
  const upcomingCollections = useMemo(() => schedule?.upcomingCollections || [], [schedule?.upcomingCollections]);
  const reminderOwnerId = session?.user._id || session?.user.id || session?.user.email;
  useEffect(() => {
    if (!session?.token || session.user.role !== 'resident' || !schedule || !reminderOwnerId || isSettingsVisible) return;
    let disposed = false;
    let ready = false;
    const reconcile = () => {
      if (disposed || !ready || AppState.currentState === 'background') return;
      void scheduleCollectionReminders(upcomingCollections, schedule.location || location, reminderOwnerId).catch((error) => {
        console.warn('Collection reminder scheduling failed:', error);
      });
    };
    void (async () => {
      // Load the existing server preference, with the persisted device value as
      // the offline fallback. Do not re-enable reminders on every schedule refresh.
      try {
        if (API_URL) {
          const { response, payload } = await requestJson<ApiResponse<{ settings: { notifications?: { pushEnabled?: boolean; collectionReminders?: boolean } } }>>(`${API_URL}/auth/settings`, {
            headers: { Authorization: `Bearer ${session.token}` },
          });
          if (!disposed && response.ok && payload.success && payload.data) {
            const preferences = payload.data.settings.notifications;
            await setCollectionReminderPreference(reminderOwnerId, preferences?.pushEnabled !== false && preferences?.collectionReminders !== false);
          }
        }
      } catch (error) {
        console.warn('Using saved collection notification preferences:', error);
      }
      ready = true;
      reconcile();
    })();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') reconcile(); });
    const timer = setInterval(reconcile, 30000);
    return () => { disposed = true; subscription.remove(); clearInterval(timer); };
  }, [isSettingsVisible, location, reminderOwnerId, schedule, session?.token, session?.user.role, upcomingCollections]);

  const visibleUpcomingCollections = showAllUpcoming ? upcomingCollections : upcomingCollections.slice(0, 3);
  const nextCollectionEntry = schedule?.upcomingCollections.find((collection) => (
    schedule.nextCollection && dateKey(collection.date) === dateKey(schedule.nextCollection)
  ));
  const nextTimeWindows = nextCollectionEntry?.timeWindows
    || schedule?.schedules.find((entry) => entry.wasteType === schedule.nextWasteType)?.timeWindows
    || [];

  const homeScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <HomeSectionLabel first label="Next collection" />
      {isLoadingSchedule && schedule ? <ActivityIndicator accessibilityLabel="Loading" color="#0A7F4F" /> : null}
      <SkeletonRegion state={scheduleSkeleton} placeholder={<View style={styles.nextCollectionSkeleton}><SkeletonBlock height={170} radius={24} /></View>}>
      <View style={styles.nextCollectionCard}>
        <LinearGradient pointerEvents="none" colors={toWasteLabel(schedule?.nextWasteType) === 'Non-Biodegradable' ? ['#286AC4', '#102D54'] : ['#24846E', '#0D2E27']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.collectionGradient} />
        <View pointerEvents="none" style={styles.gradientContrast} />
        {schedule?.nextCollection ? <>
          <Text style={styles.nextDate}>{formatDate(schedule.nextCollection, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          <View style={styles.nextInfoRow}><WastePill hero type={toWasteLabel(schedule.nextWasteType)} /><Text style={styles.nextTime}>{nextTimeWindows.length ? nextTimeWindows.join(' · ') : 'Time unavailable'}</Text></View>
        </> : <Text style={styles.nextDate}>{scheduleError ? 'Schedule unavailable' : 'No upcoming collection'}</Text>}
        <View style={styles.darkDivider} />
        <Text style={styles.reminder}>Segregate food waste, garden waste, and paper into green bags.</Text>
      </View>
      </SkeletonRegion>

      <HomeSectionLabel label="Weekly schedule" />
      <View style={styles.homeFlatList}>
        <SkeletonRegion state={scheduleSkeleton} placeholder={<SkeletonRows kind="weekly" count={5} />}>
        {scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : null}
        {weeklyCollections.length ? weeklyCollections.map((collection, index) => <RevealRow key={collection.date} animate={revealSchedule} index={index}><View style={styles.weeklyRow}><Text style={styles.rowDay}>{collection.dayName}</Text><WastePill type={toWasteLabel(collection.wasteType)} /></View></RevealRow>) : !scheduleError ? <Text style={styles.emptyScheduleText}>No collections scheduled this week.</Text> : null}
        </SkeletonRegion>
      </View>

      <SegregationGuide collections={weeklyCollections} />

      <HomeSectionLabel label="My recent reports" onViewAll={() => setActiveTab('report')} />
      {isLoadingReports && pastReports.length > 0 ? <ActivityIndicator accessibilityLabel="Loading" color="#0A7F4F" /> : null}
      <View style={styles.homeFlatList}>
        <SkeletonRegion state={reportsSkeleton} placeholder={<SkeletonRows kind="report" count={3} />}>
          {reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : null}
          {pastReports.length || !reportError ? <ReportList animate={revealReports} onSelect={setSelectedReport} reports={pastReports.slice(0, 2)} showPhoto /> : null}
        </SkeletonRegion>
      </View>
    </ScrollView>
  );

  const scheduleScreen = (
    <ScrollView contentContainerStyle={styles.newsScreenContent} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl onRefresh={() => { if (session?.token) void loadAnnouncements(session.token); }} refreshing={announcementLoading} tintColor="#0A7F4F" />} onScroll={({ nativeEvent }) => { if (announcementHasMore && !announcementLoading && nativeEvent.layoutMeasurement.height + nativeEvent.contentOffset.y >= nativeEvent.contentSize.height - 240 && session?.token) void loadAnnouncements(session.token, false); }} scrollEventThrottle={200}>
      <Text style={styles.newsScreenTitle}>Announcements</Text><Text style={styles.newsScreenSubtitle}>Service updates from SWMO</Text>
      <View style={styles.announcementFilters}><Pressable onPress={() => setAnnouncementScope('all')} style={[styles.announcementFilter, announcementScope === 'all' && styles.announcementFilterActive]}><Text style={[styles.announcementFilterText, announcementScope === 'all' && styles.announcementFilterTextActive]}>All</Text></Pressable><Pressable onPress={() => setAnnouncementScope('mine')} style={[styles.announcementFilter, announcementScope === 'mine' && styles.announcementFilterActive]}><Text style={[styles.announcementFilterText, announcementScope === 'mine' && styles.announcementFilterTextActive]}>My area</Text></Pressable></View>
      {announcementError ? <Text style={styles.errorMessage}>{announcementError}</Text> : null}
      {announcements.map(item => <AnnouncementCard item={item} key={item.id} />)}
      {announcementLoading && !announcements.length ? <ActivityIndicator color="#0A7F4F" /> : null}
      {!announcementLoading && !announcements.length && !announcementError ? <Text style={styles.emptyScheduleText}>No announcements yet.</Text> : null}
    </ScrollView>
  );

  const legacyReportScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Report center</Text>
      <Text style={styles.screenSubtitle}>Message the collection team about uncollected waste</Text>
      <RealtimeStatus status={socketStatus} />

      <Card style={styles.reportChatComposerCard}>
        <View style={styles.reportChatComposerHeading}>
          <View style={styles.reportChatComposerIcon}><Feather color="#07815f" name="message-circle" size={20} /></View>
          <View style={styles.reportChatComposerHeadingText}>
            <Text style={styles.reportChatComposerTitle}>Start a report</Text>
            <Text style={styles.reportChatComposerSubtitle}>Send a message and photo to SWMO.</Text>
          </View>
        </View>

        {renderPhotoProofSection()}

        <TextInput multiline onChangeText={setDescription} placeholder="What happened? Write a message..." placeholderTextColor="#9aa69f" style={styles.reportChatDraftInput} value={description} />
        {reportMessage ? <Text accessibilityRole="alert" style={reportMessage.includes('submitted') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text> : null}
        <View style={styles.reportChatComposerActions}><Pressable disabled={isCapturingPhoto} onPress={capturePhoto} style={[styles.retakeButton, isCapturingPhoto && styles.disabledButton]}>{isCapturingPhoto ? <ActivityIndicator color="#07815f" size="small" /> : <Feather color="#07815f" name="camera" size={15} />}<Text style={styles.retakeText}>{isCapturingPhoto ? 'Opening camera...' : selectedPhoto ? 'Retake photo' : 'Take photo'}</Text></Pressable><Pressable disabled={isSubmitting} onPress={submitReport} style={[styles.submitButton, isSubmitting && styles.disabledButton]}>{isSubmitting ? <ActivityIndicator color="#ffffff" /> : <><Feather color="#ffffff" name="send" size={15} /><Text style={styles.submitButtonText}>Send report</Text></>}</Pressable></View>
      </Card>

      <Card style={styles.card}>
        <View style={styles.cardTopRow}><Text style={styles.cardHeading}>YOUR REPORT CONVERSATIONS</Text>{pastReports.length ? <Text style={styles.reportCount}>{pastReports.length}</Text> : null}</View>
        {isLoadingReports ? <ActivityIndicator color="#07815f" style={styles.loadingReports} /> : null}
        {reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : null}
        {!isLoadingReports && !reportError ? <ReportList onSelect={setSelectedReport} reports={pastReports} /> : null}
      </Card>
    </ScrollView>
  );

  const reportScreen = isCreatingReport ? (
    <View style={styles.complaintsPage}>
      <View style={styles.newComplaintHeader}>
        <Pressable accessibilityLabel="Back to complaints" accessibilityRole="button" onPress={() => { setIsCreatingReport(false); setReportMessage(''); setAiDetection({ status: 'idle' }); }} style={styles.newComplaintBack}>
          <Feather color="#07815f" name="chevron-left" size={23} />
        </Pressable>
        <View style={styles.newComplaintHeaderText}>
          <Text style={styles.newComplaintTitle}>New complaint</Text>
          <Text style={styles.newComplaintSubtitle}>SWMO Support · Naga City</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.newComplaintContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.fieldLabel}>Subject</Text>
        <TextInput onChangeText={setReportSubject} accessibilityLabel="Subject" placeholder="e.g. Missed collection on Gen. Luna St." placeholderTextColor="#5A6761" style={styles.newComplaintInput} value={reportSubject} />
        <Text style={styles.fieldLabel}>Waste category</Text>
        <AppSelect appearance="auth" leadingIcon="tag" placeholder="Select waste category" value={wasteCategory} onChange={setWasteCategory} options={WASTE_CATEGORY_OPTIONS} disabled={isSubmitting} />
        <Text style={styles.fieldLabel}>Message</Text>
        <TextInput multiline onChangeText={setDescription} accessibilityLabel="Message" placeholder="Describe the issue — street, number of bags, how long it has been there..." placeholderTextColor="#5A6761" style={[styles.newComplaintInput, styles.newComplaintMessageInput]} value={description} />
        <Text style={styles.fieldLabel}>Photo proof</Text>
        {renderPhotoProofSection()}
        {reportMessage ? <ToastMotion><Text accessibilityRole="alert" style={reportMessage.startsWith('Complaint sent') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text></ToastMotion> : null}
      </ScrollView>
      <View style={styles.newComplaintFooter}>
        <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={submitReport} style={[styles.newComplaintSendButton, isSubmitting && styles.disabledButton]}>
          {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <><Feather color="#ffffff" name="send" size={16} /><Text style={styles.submitButtonText}>Send complaint</Text></>}
        </Pressable>
      </View>
    </View>
  ) : (
    <View style={styles.complaintsPage}>
      <View style={styles.complaintsHeader}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.complaintsTitle}>Complaints</Text>
          <Text style={styles.complaintsSubtitle}>Direct line to SWMO Support</Text>
        </View>
        <Pressable accessibilityLabel="New complaint" accessibilityRole="button" onPress={() => { setReportSubject(''); setWasteCategory(''); setDescription(''); setSelectedPhoto(null); setPhotoMetadata(null); setAiDetection({ status: 'idle' }); setReportMessage(''); setIsCreatingReport(true); }} style={styles.complaintPlusButton}>
          <Feather color="#ffffff" name="plus" size={24} />
        </Pressable>
      </View>
      <RealtimeStatus status={socketStatus} />
      <ScrollView contentContainerStyle={styles.complaintsListContent} showsVerticalScrollIndicator={false}>
        {reportMessage ? <ToastMotion><Text accessibilityRole="alert" style={reportMessage.startsWith('Complaint sent') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text></ToastMotion> : null}
        <View style={styles.complaintsListCard}>
          {isLoadingReports && pastReports.length > 0 ? <ActivityIndicator accessibilityLabel="Loading" color="#0A7F4F" /> : null}
          <SkeletonRegion state={reportsSkeleton} placeholder={<SkeletonRows kind="complaint" count={7} />}>
          {reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : null}
          {pastReports.length || !reportError ? <ReportList animate={revealReports} onSelect={setSelectedReport} reports={pastReports} /> : null}
          </SkeletonRegion>
        </View>
      </ScrollView>
    </View>
  );

  const profileScreen = (
    <ScrollView contentContainerStyle={styles.profileContent} showsVerticalScrollIndicator={false}>
      <Text accessibilityRole="header" style={styles.profileTitle}>Profile</Text>
      {<View style={styles.profileHero}>
          <LinearGradient pointerEvents="none" colors={['#24846E', '#0D2E27']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={styles.collectionGradient} />
          <View pointerEvents="none" style={styles.gradientContrast} />
          <View style={styles.profileHeroRow}>
            <ResidentAvatar uri={session?.user.profilePhotoUrl} name={displayName} size={72}/>
            <View style={styles.profileHeroCopy}>
              <Text style={styles.profileName}>{displayName}</Text>
              {session?.user.phone?.trim() ? <View style={styles.profileContactRow}>
                <Feather accessible={false} color="#E3F4EB" name="phone" size={16} />
                <Text style={styles.profileContactText}>{phone}</Text>
              </View> : null}
              {session?.user.location?.trim() || session?.user.barangay?.trim() ? <View style={styles.profileContactRow}>
                <Feather accessible={false} color="#E3F4EB" name="map-pin" size={16} />
                <Text style={styles.profileContactText}>{location}, {CITY}</Text>
              </View> : null}
            </View>
          </View>
          <View style={styles.profileHeroDivider} />
          <Pressable accessibilityRole="button" onPress={() => { setProfileMessage(''); setProfilePhoto(null); setProfilePhotoRemoved(false); setProfileName(session?.user.name || ''); setProfilePhone(session?.user.phone || ''); setProfileLocation(session?.user.location || session?.user.barangay || ''); setIsEditingProfile(true); }} style={styles.editProfileButton}><Feather color="#0B5D44" name="edit-2" size={20} /><Text style={styles.editProfileText}>Edit Profile</Text></Pressable>
          {profileMessage ? <ToastMotion><Text style={styles.profileHeroMessage}>{profileMessage}</Text></ToastMotion> : null}
      </View>}

      <View style={styles.menuCard}>
        <Pressable accessibilityRole="button" onPress={() => setIsSettingsVisible(true)} style={styles.menuRow}><View accessible={false} style={styles.profileMenuBadge}><Feather color="#0A7F4F" name="settings" size={20} /></View><Text style={styles.menuText}>Settings & Preferences</Text><Feather color="#5A6761" name="chevron-right" size={20} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setActiveTab('home')} style={styles.menuRow}><View accessible={false} style={styles.profileMenuBadge}><Feather color="#0A7F4F" name="calendar" size={20} /></View><Text style={styles.menuText}>Collection Schedule</Text><Feather color="#5A6761" name="chevron-right" size={20} /></Pressable>
        <Pressable accessibilityRole="button" onPress={() => setIsPrivacyVisible(true)} style={[styles.menuRow, { borderBottomWidth: 0 }]}><View accessible={false} style={styles.profileMenuBadge}><Feather color="#0A7F4F" name="shield" size={20} /></View><Text style={styles.menuText}>Privacy Policy</Text><Feather color="#5A6761" name="chevron-right" size={20} /></Pressable>
      </View>

      <Pressable accessibilityRole="button" onPress={signOut} style={styles.signOutButton}><Feather color="#B3261E" name="log-out" size={20} /><Text style={styles.signOutText}>Sign Out</Text></Pressable>
    </ScrollView>
  );

  const tabScreen = useMemo(() => ({ home: homeScreen, schedule: scheduleScreen, report: reportScreen, profile: profileScreen })[activeTab], [activeTab, homeScreen, profileScreen, reportScreen, scheduleScreen]);

  if (isEditingProfile && session) return <ResidentProfileEditor session={session} apiUrl={API_URL || ''} name={profileName} phone={profilePhone} location={profileLocation} photo={profilePhoto} removed={profilePhotoRemoved} busy={isSavingProfile} error={profileMessage} setName={setProfileName} setPhone={setProfilePhone} setLocation={setProfileLocation} setPhoto={setProfilePhoto} setRemoved={setProfilePhotoRemoved} save={saveProfile} close={() => { setIsEditingProfile(false); setProfilePhoto(null); setProfilePhotoRemoved(false); setProfileMessage(''); }}/>;

  return (
    <SafeAreaView edges={['left', 'right']} style={[styles.safeArea, isDarkTheme && { backgroundColor: '#101815' }]}>
      <StatusBar backgroundColor={isDarkTheme ? '#101815' : '#FFFFFF'} style={isDarkTheme ? 'light' : 'dark'} translucent={false} />
      {activeTab === 'home' && (
        <View style={[styles.residentHeader, { paddingTop: insets.top }]}>
          <View style={styles.brandHeader}>
            <BrandMark height={48} width={150} />
            <View style={styles.headerGreeting}>
              <Text numberOfLines={1} adjustsFontSizeToFit style={styles.headerGreetingText}>Good morning,</Text>
              <Text numberOfLines={1} ellipsizeMode="tail" style={styles.headerName}>{displayName}</Text>
            </View>
          </View>
        </View>
      )}
      <View style={[styles.content, isDarkTheme && { backgroundColor: '#101815' }, activeTab !== 'home' && { paddingTop: insets.top }]}><TabTransition activeKey={activeTab}>{tabScreen}</TabTransition></View>
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      {renderReportDetails()}
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
      <PrivacyPolicyModal visible={isPrivacyVisible} onClose={() => setIsPrivacyVisible(false)} />
      {session ? (
        <ResidentSettingsModal
          apiUrl={API_URL ?? ''}
          onClose={() => setIsSettingsVisible(false)}
          onSessionUpdate={setSession}
          onSignOut={completeSignOut}
          session={session}
          visible={isSettingsVisible}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  nextCollectionSkeleton: { marginTop: 12 },
  homeFlatList: { marginTop: 8 },
  viewAllButton: { minHeight: 44, justifyContent: 'center' },
  collectionGradient: { ...StyleSheet.absoluteFillObject, borderRadius: 24 },
  gradientContrast: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.10)' },
  heroWastePill: { backgroundColor: 'rgba(13,46,39,0.45)' },
  heroWasteText: { color: '#FFFFFF', fontSize: 14 },
  newComplaintFooter: { backgroundColor: '#FFFFFF', paddingHorizontal: 20, paddingVertical: 12 },
  navIcon: { width: 56, height: 32, borderRadius: 16, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  navIconActive: { backgroundColor: '#E3F4EB' },
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  residentHeader: { backgroundColor: '#FFFFFF' },
  brandHeader: { alignItems: 'center', flexDirection: 'row', height: 70, paddingHorizontal: 20 },
  headerGreeting: { alignItems: 'flex-end', flex: 1, minWidth: 0, marginLeft: 12 },
  headerGreetingText: { color: '#5A6761', fontSize: 12, textAlign: 'right' },
  headerName: { color: '#121A16', fontSize: 14, fontWeight: '700', marginTop: 1, textAlign: 'right' },
  content: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 32 },
  newsScreenContent: { padding: 20, paddingBottom: 32 },
  newsScreenTitle: { color: '#121A16', fontSize: 30, fontWeight: '700', marginBottom: 2 },
  newsScreenSubtitle: { color: '#5A6761', fontSize: 16, marginBottom: 18 },
  announcementFilters: { flexDirection: 'row', gap: 10, marginBottom: 22 },
  announcementFilter: { borderColor: '#D5E0DA', borderRadius: 24, borderWidth: 1, paddingHorizontal: 22, paddingVertical: 11 },
  announcementFilterActive: { backgroundColor: '#087D5B', borderColor: '#087D5B' },
  announcementFilterText: { color: '#20372A', fontSize: 16, fontWeight: '700' },
  announcementFilterTextActive: { color: '#FFFFFF' },
  announcementMeta: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  announcementNew: { backgroundColor: '#087D5B', borderRadius: 16, color: '#FFFFFF', fontSize: 11, fontWeight: '800', paddingHorizontal: 10, paddingVertical: 4 },
  announcementArtwork: { alignItems: 'center', backgroundColor: '#1d5545', justifyContent: 'center' },
  announcementArtworkText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', letterSpacing: 1 },
  newsCard: { backgroundColor: '#F4F6F5', borderRadius: 24, marginBottom: 16, overflow: 'hidden' },
  newsCategory: { color: '#086B42', fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10, textTransform: 'uppercase' },
  newsCardContent: { },
  newsThumbnail: { backgroundColor: '#CFE3D8', height: 180, width: '100%' },
  newsCopy: { padding: 18, minWidth: 0 },
  newsHeadline: { color: '#121A16', fontSize: 20, fontWeight: '700' },
  newsDate: { color: '#5A6761', fontSize: 13, marginTop: 10 },
  newsExcerpt: { color: '#5A6761', fontSize: 14, marginTop: 10 },
  greeting: { color: '#5d7066', fontSize: 13, marginTop: 2 },
  name: { color: '#20372a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  location: { color: '#809087', fontSize: 11, marginTop: 3 },
  screenTitle: { color: '#1f382a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  screenSubtitle: { color: '#74847b', fontSize: 11, marginTop: 4 },
  realtimeStatus: { alignItems: 'center', flexDirection: 'row', gap: 7, marginHorizontal: 20, marginBottom: 12, paddingVertical: 8 },
  realtimeConnected: { },
  realtimeConnecting: { },
  realtimeDisconnected: { },
  realtimeStatusDot: { backgroundColor: '#07815f', borderRadius: 4, height: 7, width: 7 },
  realtimeStatusText: { color: '#086B42', fontSize: 13, fontWeight: '600', flexShrink: 1 },
  card: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  calendarCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, padding: 17, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  calendarHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  calendarMonthTitle: { color: '#20372a', fontSize: 22, fontWeight: '800' },
  calendarHeaderActions: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  calendarHeaderButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  calendarWeekdayRow: { flexDirection: 'row', marginTop: 25 },
  calendarWeekday: { color: '#829087', flex: 1, fontSize: 12, fontWeight: '800', textAlign: 'center' },
  calendarDivider: { backgroundColor: '#edf1ef', height: 1, marginTop: 13 },
  monthGrid: { marginTop: 8 },
  monthWeek: { flexDirection: 'row' },
  monthDateCell: { alignItems: 'center', flex: 1, height: 58, justifyContent: 'center' },
  monthDateCircle: { alignItems: 'center', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  monthDateCircleSelected: { backgroundColor: '#d8f8e8' },
  monthDateText: { color: '#2d4538', fontSize: 15, fontWeight: '600' },
  monthDateTextOutside: { color: '#b0bbb5' },
  monthDateTextSelected: { color: '#07815f', fontWeight: '800' },
  monthEventDot: { backgroundColor: 'transparent', borderRadius: 3, height: 5, marginTop: 1, width: 5 },
  monthEventDotBio: { backgroundColor: '#07815f' },
  monthEventDotNonBio: { backgroundColor: '#2f70d7' },
  calendarLegend: { alignItems: 'center', borderTopColor: '#edf1ef', borderTopWidth: 1, flexDirection: 'row', gap: 16, justifyContent: 'center', marginTop: 4, paddingTop: 10 },
  calendarLegendItem: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  calendarLegendText: { color: '#84928a', fontSize: 9 },
  selectedCalendarDay: { alignItems: 'center', backgroundColor: '#f8fbf9', borderColor: '#e0e9e3', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 12, marginTop: 10, paddingHorizontal: 14, paddingVertical: 13 },
  selectedCalendarEventText: { flex: 1 },
  selectedCalendarEventDate: { color: '#2d4538', fontSize: 12, fontWeight: '800' },
  selectedCalendarEventMeta: { alignItems: 'center', flexDirection: 'row', gap: 8, marginTop: 6 },
  selectedCalendarEventTime: { color: '#74847b', flex: 1, fontSize: 10 },
  selectedCalendarEmpty: { color: '#89978f', flex: 1, fontSize: 12, lineHeight: 18 },
  nextCollectionCard: { backgroundColor: '#0D2E27', borderRadius: 24, overflow: 'hidden', padding: 16, marginTop: 10 },
  darkCardEyebrow: { color: '#b9e6d3', fontSize: 10, fontWeight: '800' },
  nextDate: { color: '#FFFFFF', fontSize: 23, fontWeight: '700' },
  scheduleLoader: { marginTop: 12 },
  nextInfoRow: { alignItems: 'flex-start', gap: 8, marginTop: 12 },
  nextTime: { color: '#E3F4EB', fontSize: 14 },
  darkDivider: { backgroundColor: 'rgba(255,255,255,0.2)', height: 1, marginVertical: 12 },
  reminder: { color: '#E3F4EB', fontSize: 13, lineHeight: 19 },
  cardHeading: { color: '#61746a', fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  viewAll: { color: '#086B42', fontSize: 14, fontWeight: '600' },
  homeSectionRow: { marginTop: 20, marginBottom: 2 },
  homeFirstSection: { marginTop: 0 },
  homeSectionContent: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  homeSectionLabel: { color: '#121A16', fontSize: 20, fontWeight: '700', flex: 1 },
  loadingSchedule: { marginTop: 14 },
  emptyScheduleText: { color: '#89978f', fontSize: 11, marginTop: 13 },
  weeklyRow: { alignItems: 'center', borderBottomColor: '#E3EAE6', borderBottomWidth: 1, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, minHeight: 56, paddingVertical: 10 },
  rowDay: { color: '#121A16', fontSize: 16, fontWeight: '600' },
  wastePill: { alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, flexDirection: 'row', gap: 6, paddingHorizontal: 10, paddingVertical: 6, maxWidth: '100%' },
  bioPill: { backgroundColor: '#E3F4EB' },
  nonBioPill: { backgroundColor: '#E8F0FE' },
  wastePillText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  bioPillText: { color: '#086B42' },
  nonBioPillText: { color: '#1A56C4' },
  recentReportRow: { alignItems: 'center', borderBottomColor: '#eff2f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 54 },
  reportMain: { flex: 1, paddingRight: 10 },
  reportLocation: { color: '#31443a', fontSize: 11, fontWeight: '700' },
  reportMeta: { color: '#9aa69f', fontSize: 9, marginTop: 3 },
  reportDescription: { color: '#7a887f', fontSize: 9, marginTop: 3 },
  statusPill: { alignSelf: 'flex-start', alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: '100%' },
  scheduledPill: { backgroundColor: '#E8F0FE' },
  resolvedPill: { backgroundColor: '#E3F4EB' },
  rejectedPill: { backgroundColor: '#FDECEA' },
  statusDot: { borderRadius: 4, height: 5, width: 5 },
  scheduledDot: { backgroundColor: '#1A56C4' },
  resolvedDot: { backgroundColor: '#086B42' },
  rejectedDot: { backgroundColor: '#B3261E' },
  statusText: { fontSize: 12, fontWeight: '600', flexShrink: 1 },
  scheduledText: { color: '#1A56C4' },
  resolvedText: { color: '#086B42' },
  rejectedText: { color: '#B3261E' },
  upcomingRow: { alignItems: 'center', borderRadius: 13, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 10 },
  upcomingBio: { backgroundColor: '#f0fcf6', borderColor: '#cbf2dd', borderWidth: 1 },
  upcomingNonBio: { backgroundColor: '#f5f9ff', borderColor: '#d9e8ff', borderWidth: 1 },
  collectionDate: { color: '#2d4538', fontSize: 12, fontWeight: '800' },
  collectionTime: { color: '#9aa69f', fontSize: 10, marginTop: 4 },
  reportCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, marginTop: 13, padding: 13, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  reportChatComposerCard: { backgroundColor: '#ffffff', borderColor: '#dce9e1', borderRadius: 18, borderWidth: 1, marginTop: 13, padding: 14, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  reportChatComposerHeading: { alignItems: 'center', flexDirection: 'row' },
  reportChatComposerIcon: { alignItems: 'center', backgroundColor: '#dff7e9', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  reportChatComposerHeadingText: { flex: 1, marginLeft: 10 },
  reportChatComposerTitle: { color: '#203d2f', fontSize: 14, fontWeight: '800' },
  reportChatComposerSubtitle: { color: '#829087', fontSize: 10, marginTop: 3 },
  reportAttachment: { borderRadius: 12, height: 92, marginTop: 13, overflow: 'hidden', position: 'relative' },
  reportAttachmentEmpty: { alignItems: 'center', backgroundColor: '#f5fbf7', borderColor: '#c8e9d5', borderStyle: 'dashed', borderWidth: 1.5, flexDirection: 'row', paddingHorizontal: 12 },
  reportAttachmentIcon: { alignItems: 'center', backgroundColor: '#dff7e9', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  reportAttachmentCopy: { flex: 1, marginLeft: 10 },
  reportAttachmentTitle: { color: '#315043', fontSize: 12, fontWeight: '800' },
  reportAttachmentSubtitle: { color: '#829087', fontSize: 9, marginTop: 3 },
  reportAttachmentImage: { height: '100%', width: '100%' },
  reportAttachmentOverlay: { alignItems: 'center', backgroundColor: 'rgba(18,50,36,0.76)', bottom: 0, flexDirection: 'row', gap: 6, left: 0, paddingHorizontal: 10, paddingVertical: 7, position: 'absolute', right: 0 },
  reportAttachmentOverlayText: { color: '#ffffff', fontSize: 10, fontWeight: '700' },
  reportChatDraftInput: { backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 12, borderWidth: 1, color: '#243f31', fontSize: 12, marginTop: 11, minHeight: 64, padding: 11, textAlignVertical: 'top' },
  photoMetadataHint: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 8 },
  photoMetadataHintText: { color: '#6f8277', flex: 1, fontSize: 9, lineHeight: 13 },
  reportChatComposerActions: { flexDirection: 'row', gap: 9, marginTop: 11 },
  reportCount: { color: '#07815f', fontSize: 10, fontWeight: '800' },
  complaintsPage: { backgroundColor: '#ffffff', flex: 1 },
  complaintsHeader: { alignItems: 'center', flexDirection: 'row', padding: 20, gap: 12, paddingBottom: 8 },
  complaintsTitle: { color: '#121A16', fontSize: 30, fontWeight: '700' },
  complaintsSubtitle: { color: '#5A6761', fontSize: 14, marginTop: 6 },
  complaintPlusButton: { alignItems: 'center', backgroundColor: '#0A7F4F', borderRadius: 26, height: 52, justifyContent: 'center', width: 52 },
  complaintsListContent: { paddingHorizontal: 20, paddingBottom: 32 },
  complaintsListCard: { backgroundColor: '#FFFFFF' },
  complaintsEmpty: { color: '#89978f', fontSize: 12, paddingVertical: 24, textAlign: 'center' },
  complaintRowPressable: { borderBottomColor: '#E3EAE6', borderBottomWidth: 1 },
  complaintRow: { alignItems: 'center', flexDirection: 'row', minHeight: 92, paddingVertical: 16, gap: 12 },
  complaintIcon: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  complaintCopy: { flex: 1, minWidth: 0 },
  complaintSubject: { color: '#121A16', fontSize: 16, fontWeight: '700' },
  complaintPreview: { color: '#5A6761', fontSize: 13, marginTop: 4 },
  complaintMeta: { alignItems: 'flex-start', marginTop: 8 },
  complaintDate: { color: '#87958e', fontSize: 9, marginBottom: 5 },
  newComplaintHeader: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e5e9e7', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12 },
  newComplaintBack: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  newComplaintHeaderText: { flex: 1, marginLeft: 4 },
  newComplaintTitle: { color: '#121A16', fontSize: 24, fontWeight: '700' },
  newComplaintSubtitle: { color: '#5A6761', fontSize: 14, marginTop: 2 },
  newComplaintContent: { paddingHorizontal: 20, paddingBottom: 24 },
  newComplaintInput: { backgroundColor: '#F1F5F3', borderRadius: 16, color: '#121A16', fontSize: 16, minHeight: 56, paddingHorizontal: 16, paddingVertical: 14 },
  newComplaintMessageInput: { minHeight: 140, textAlignVertical: 'top' },
  newComplaintSendButton: { alignItems: 'center', backgroundColor: '#0A7F4F', borderRadius: 18, flexDirection: 'row', gap: 10, minHeight: 56, padding: 14, justifyContent: 'center' },
  photoPreview: { borderRadius: 12, height: 176, marginTop: 10, overflow: 'hidden', position: 'relative' },
  photoEmpty: { alignItems: 'center', backgroundColor: '#f3faf6', borderColor: '#bfe8d0', borderStyle: 'dashed', borderWidth: 1.5, justifyContent: 'center' },
  photoImage: { height: '100%', width: '100%' },
  photoEmptyContent: { alignItems: 'center', paddingHorizontal: 20 },
  cameraIcon: { alignItems: 'center', backgroundColor: '#dff7e9', borderRadius: 20, height: 40, justifyContent: 'center', width: 40 },
  photoEmptyTitle: { color: '#315043', fontSize: 13, fontWeight: '800', marginTop: 8 },
  photoEmptySubtext: { color: '#7a8d82', fontSize: 10, marginTop: 4, textAlign: 'center' },
  locationTag: { alignItems: 'center', backgroundColor: 'rgba(24,43,35,0.78)', borderRadius: 10, bottom: 8, flexDirection: 'row', gap: 4, left: 8, paddingHorizontal: 8, paddingVertical: 5, position: 'absolute' },
  locationTagText: { color: '#ffffff', fontSize: 9, fontWeight: '700' },
  fieldLabel: { color: '#35463F', fontSize: 14, fontWeight: '600', marginTop: 24, marginBottom: 8 },
  descriptionInput: { backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 11, borderWidth: 1, color: '#243f31', fontSize: 12, marginTop: 6, minHeight: 55, padding: 10, textAlignVertical: 'top' },
  reportButtonRow: { flexDirection: 'row', gap: 9, marginTop: 11 },
  retakeButton: { alignItems: 'center', borderColor: '#dce5e0', borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 7, height: 42, justifyContent: 'center' },
  reportAttachmentLoading: { opacity: 0.6 },
  retakeText: { color: '#3c5145', fontSize: 12, fontWeight: '800' },
  submitButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, flex: 1.25, height: 42, justifyContent: 'center' },
  disabledButton: { opacity: 0.6 },
  submitButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', flexShrink: 1 },
  successMessage: { color: '#07815f', fontSize: 11, fontWeight: '600', marginTop: 9 },
  errorMessage: { color: '#cc4251', fontSize: 11, fontWeight: '600', lineHeight: 15, marginTop: 9 },
  loadingReports: { marginTop: 14 },
  emptyReportText: { color: '#89978f', fontSize: 11, marginTop: 13 },
  reportRowPressable: { borderRadius: 10 },
  pastReportRow: { alignItems: 'center', borderBottomColor: '#eff2f0', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 62 },
  reportThumbnail: { alignItems: 'center', backgroundColor: '#D6E4DD', borderRadius: 14, height: 56, justifyContent: 'center', overflow: 'hidden', width: 56 },
  reportThumbnailImage: { height: '100%', width: '100%' },
  profilePhotoEditor: { alignItems: 'center', gap: 10, marginBottom: 18 },
  profilePhotoImage: { width: 72, height: 72, borderRadius: 36 },
  profilePhotoButton: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E3F4EB', borderRadius: 14, paddingHorizontal: 16, minHeight: 44 },
  profilePhotoHint: { color: '#5A6761', fontSize: 12 },
  profileCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 16, borderWidth: 1, padding: 18, shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8 },
  profileContent: { paddingTop: 56, paddingHorizontal: 20, paddingBottom: 32 },
  profileTitle: { color: '#121A16', fontSize: 30, fontWeight: '700', letterSpacing: -0.6, marginBottom: 20 },
  profileHero: { backgroundColor: '#0D2E27', borderRadius: 24, overflow: 'hidden', padding: 20 },
  profileHeroRow: { alignItems: 'center', flexDirection: 'row', gap: 16 },
  profileHeroCopy: { flex: 1, minWidth: 0 },
  avatar: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 36, height: 72, justifyContent: 'center', width: 72 },
  avatarText: { color: '#0B5D44', fontSize: 28, fontWeight: '700' },
  profileName: { color: '#FFFFFF', fontSize: 24, fontWeight: '700' },
  profileContactRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, marginTop: 8 },
  profileContactText: { color: '#E3F4EB', fontSize: 14, flex: 1, minWidth: 0 },
  profileHeroDivider: { backgroundColor: 'rgba(255,255,255,0.2)', height: 1, marginTop: 18, marginBottom: 16 },
  profileHeroMessage: { color: '#E3F4EB', fontSize: 13, marginTop: 12 },
  editProfileButton: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 48, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', gap: 10 },
  editProfileText: { color: '#0B5D44', fontSize: 15, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  profileEditTitle: { color: '#2c4135', fontSize: 16, fontWeight: '800', marginBottom: 4 },
  profileFieldLabel: { alignSelf: 'stretch', color: '#61746a', fontSize: 11, fontWeight: '700', marginTop: 10 },
  profileInput: { alignSelf: 'stretch', backgroundColor: '#f9fbfa', borderColor: '#dbe5df', borderRadius: 10, borderWidth: 1, color: '#243f31', fontSize: 12, height: 40, marginTop: 5, paddingHorizontal: 10 },
  profileEditActions: { alignSelf: 'stretch', flexDirection: 'row', gap: 8, marginTop: 14 },
  profileCancelButton: { alignItems: 'center', borderColor: '#dce5e0', borderRadius: 10, borderWidth: 1, flex: 1, height: 40, justifyContent: 'center' },
  profileCancelText: { color: '#3c5145', fontSize: 11, fontWeight: '800' },
  profileSaveButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 10, flex: 1.3, height: 40, justifyContent: 'center' },
  profileSaveText: { color: '#ffffff', fontSize: 11, fontWeight: '800' },
  menuCard: { marginTop: 24 },
  profileMenuBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F4EB', borderRadius: 18, height: 36, width: 36 },
  menuRow: { alignItems: 'center', borderBottomColor: '#E3EAE6', borderBottomWidth: 1, flexDirection: 'row', gap: 12, minHeight: 64, paddingVertical: 12 },
  menuText: { color: '#121A16', flex: 1, minWidth: 0, fontSize: 16, fontWeight: '600' },
  signOutButton: { alignItems: 'center', backgroundColor: '#FDECEA', borderRadius: 16, flexDirection: 'row', gap: 10, minHeight: 52, padding: 12, justifyContent: 'center', marginTop: 28 },
  signOutText: { color: '#B3261E', fontSize: 16, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  reportModalBackdrop: { backgroundColor: 'rgba(10, 28, 19, 0.42)', flex: 1, justifyContent: 'flex-end' },
  reportModalDismissArea: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  reportDetailsSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, flexShrink: 1, maxHeight: '90%', paddingHorizontal: 18, paddingTop: 18, width: '100%' },
  reportDetailsHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  reportDetailsBack: { alignItems: 'center', height: 36, justifyContent: 'center', marginRight: 6, width: 30 },
  reportDetailsHeaderText: { flex: 1 },
  reportDetailsEyebrow: { color: '#07815f', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
  reportDetailsTitle: { color: '#20362a', fontSize: 20, fontWeight: '800', marginTop: 4 },
  reportDetailsClose: { alignItems: 'center', backgroundColor: '#f1f5f2', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  reportDetailsContent: { paddingBottom: 28, paddingTop: 16 },
  reportDetailsPhoto: { backgroundColor: '#edf3ef', borderRadius: 16, height: 220, width: '100%' },
  reportNoPhotoCard: { alignItems: 'center', backgroundColor: '#f1f5f2', borderRadius: 16, height: 150, justifyContent: 'center' },
  reportNoPhotoText: { color: '#718077', fontSize: 12, fontWeight: '700', marginTop: 8 },
  reportDetailsStatusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  reportDetailsDate: { color: '#89978f', fontSize: 10 },
  reportDetailsSectionTitle: { color: '#61746a', fontSize: 10, fontWeight: '800', letterSpacing: 0.4, marginTop: 18 },
  reportStatusTracker: { backgroundColor: '#f8fbf9', borderColor: '#e0e9e3', borderRadius: 14, borderWidth: 1, marginTop: 12, paddingBottom: 11, paddingHorizontal: 14, paddingTop: 8 },
  trackerTitle: { color: '#61746a', fontSize: 10, fontWeight: '800', letterSpacing: 0.4 },
  trackerStages: { flexDirection: 'row', marginTop: 14 },
  trackerStage: { alignItems: 'center', flex: 1, minWidth: 0, position: 'relative' },
  trackerDot: { alignItems: 'center', backgroundColor: '#dce5df', borderRadius: 9, height: 18, justifyContent: 'center', width: 18, zIndex: 1 },
  trackerDotActive: { backgroundColor: '#07815f' },
  trackerConnector: { backgroundColor: '#dce5df', height: 2, left: '50%', position: 'absolute', right: '-50%', top: 8 },
  trackerConnectorActive: { backgroundColor: '#07815f' },
  trackerLabel: { color: '#93a098', fontSize: 9, lineHeight: 12, marginTop: 7, minHeight: 24, textAlign: 'center' },
  trackerLabelActive: { color: '#315043', fontWeight: '800' },
  rejectedTrackerText: { color: '#d44859', fontSize: 11, fontWeight: '700', marginTop: 10 },
  reportDetailsInfoCard: { alignItems: 'center', backgroundColor: '#f8fbf9', borderRadius: 12, flexDirection: 'row', marginTop: 8, padding: 11 },
  reportDetailIcon: { alignItems: 'center', backgroundColor: '#e3f6eb', borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  reportDetailInfoText: { flex: 1, marginLeft: 10 },
  reportDetailLabel: { color: '#829087', fontSize: 10, fontWeight: '700' },
  reportDetailValue: { color: '#2d4538', fontSize: 13, fontWeight: '700', marginTop: 3 },
  reportDescriptionCard: { backgroundColor: '#f8fbf9', borderRadius: 12, marginTop: 8, padding: 11 },
  reportDescriptionDetail: { color: '#3f5549', fontSize: 12, lineHeight: 18, marginTop: 5 },
  reportChatCard: { backgroundColor: '#f8fbf9', borderColor: '#e0e9e3', borderRadius: 13, borderWidth: 1, marginTop: 10, padding: 10 },
  reportChatLoader: { marginVertical: 12 },
  reportChatEmpty: { color: '#89978f', fontSize: 11, lineHeight: 16, paddingVertical: 8 },
  reportChatMessage: { borderRadius: 11, marginTop: 8, maxWidth: '88%', padding: 9 },
  reportChatMessageResident: { alignSelf: 'flex-end', backgroundColor: '#dff7e9' },
  reportChatMessageAdmin: { alignSelf: 'flex-start', backgroundColor: '#edf2ef' },
  reportChatSender: { color: '#496255', fontSize: 9, fontWeight: '800' },
  reportChatBody: { color: '#294236', fontSize: 11, lineHeight: 16, marginTop: 3 },
  reportChatTime: { color: '#829087', fontSize: 8, marginTop: 4 },
  reportChatComposer: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 10 },
  reportChatInput: { backgroundColor: '#ffffff', borderColor: '#dbe5df', borderRadius: 9, borderWidth: 1, color: '#294236', flex: 1, fontSize: 11, minHeight: 38, paddingHorizontal: 9 },
  reportChatSend: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 9, justifyContent: 'center', minHeight: 38, paddingHorizontal: 12 },
  reportChatSendText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  bottomNav: { backgroundColor: '#FFFFFF', borderTopColor: '#E3EAE6', borderTopWidth: 1, flexDirection: 'row', paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1, minWidth: 0, minHeight: 64, paddingBottom: 8 },
  navText: { color: '#5A6761', fontSize: 11, fontWeight: '400', marginTop: 4, textAlign: 'center' },
  navTextActive: { color: '#086B42', fontWeight: '700' },
  photoEmptyPicker: { alignItems: 'center', backgroundColor: '#F7FAF8', borderColor: '#A9BDB1', borderRadius: 20, borderStyle: 'dashed', borderWidth: 1.5, flexDirection: 'row', padding: 16 },
  photoEmptyPickerIcon: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
  photoEmptyPickerCopy: { flex: 1, marginLeft: 12 },
  photoEmptyPickerTitle: { color: '#121A16', fontSize: 16, fontWeight: '700' },
  photoEmptyPickerSubtitle: { color: '#5A6761', fontSize: 13, marginTop: 4 },
  photoPreviewCard: { backgroundColor: '#ffffff', borderColor: '#dce6e0', borderRadius: 16, borderWidth: 1, marginTop: 10, overflow: 'hidden', shadowColor: '#173b2a', shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  photoImageContainer: { backgroundColor: '#1b2d24', height: 210, position: 'relative', width: '100%' },
  photoPreviewImage: { height: '100%', width: '100%' },
  photoTopBadge: { alignItems: 'center', backgroundColor: 'rgba(7, 129, 95, 0.9)', borderRadius: 12, flexDirection: 'row', gap: 5, left: 10, paddingHorizontal: 9, paddingVertical: 5, position: 'absolute', top: 10 },
  photoTopBadgeText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  retakeFloatingButton: { alignItems: 'center', backgroundColor: 'rgba(20, 38, 29, 0.78)', borderColor: 'rgba(255, 255, 255, 0.35)', borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 5, paddingHorizontal: 11, paddingVertical: 6, position: 'absolute', right: 10, top: 10 },
  retakeFloatingText: { color: '#ffffff', fontSize: 11, fontWeight: '700' },
  aiResultContainer: { paddingHorizontal: 12, paddingTop: 12 },
  aiScanningBanner: { alignItems: 'center', backgroundColor: '#f0fcf6', borderColor: '#bde7d1', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  aiScanningTitle: { color: '#07815f', fontSize: 12, fontWeight: '800' },
  aiScanningSubtext: { color: '#55796a', fontSize: 10, marginTop: 2 },
  aiVerifiedBanner: { alignItems: 'center', backgroundColor: '#eafaf1', borderColor: '#98dfb9', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  aiBadgeIconSuccess: { alignItems: 'center', backgroundColor: '#c7f4db', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  aiTextColumn: { flex: 1 },
  aiTitleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  aiVerifiedTitle: { color: '#086349', fontSize: 12, fontWeight: '800' },
  aiConfidenceBadge: { backgroundColor: '#07815f', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  aiConfidenceText: { color: '#ffffff', fontSize: 9, fontWeight: '800' },
  aiVerifiedSubtext: { color: '#326a54', fontSize: 11, marginTop: 2 },
  aiUnverifiedBanner: { alignItems: 'center', backgroundColor: '#fff9ed', borderColor: '#edd7a8', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 10, padding: 11 },
  aiBadgeIconWarning: { alignItems: 'center', backgroundColor: '#fbe9c5', borderRadius: 14, height: 28, justifyContent: 'center', width: 28 },
  aiUnverifiedTitle: { color: '#7a5113', fontSize: 12, fontWeight: '800' },
  aiUnverifiedSubtext: { color: '#7d6a45', fontSize: 10, marginTop: 2 },
  aiPendingBanner: { alignItems: 'center', backgroundColor: '#f4f7f5', borderColor: '#dce5df', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, padding: 10 },
  aiPendingText: { color: '#596e63', fontSize: 11 },
  metadataSection: { borderTopColor: '#edf2ef', borderTopWidth: 1, marginTop: 10, padding: 12 },
  metadataHeader: { alignItems: 'center', flexDirection: 'row', gap: 5, marginBottom: 8 },
  metadataSectionTitle: { color: '#63786e', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  metadataGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  metadataItem: { alignItems: 'center', backgroundColor: '#f8fbf9', borderColor: '#e2eae5', borderRadius: 10, borderWidth: 1, flexDirection: 'row', flexGrow: 1, gap: 8, minWidth: '47%', padding: 9 },
  metadataIconWrap: { alignItems: 'center', backgroundColor: '#e6f6ee', borderRadius: 13, height: 26, justifyContent: 'center', width: 26 },
  metadataTextWrap: { flex: 1, minWidth: 0 },
  metadataLabel: { color: '#7e8f85', fontSize: 9, fontWeight: '800' },
  metadataValue: { color: '#1f382a', fontSize: 11, fontWeight: '700', marginTop: 1 },
  metadataCaption: { color: '#95a49c', fontSize: 9, marginTop: 1 },
});
