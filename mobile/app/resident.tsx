import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { StatusBar } from 'expo-status-bar';
import { io } from 'socket.io-client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { AppText as Text } from '@/components/app-text';
import { SignOutConfirmModal } from '@/components/sign-out-confirm-modal';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card } from 'heroui-native';
import { House, MessageCircleWarning, Newspaper, UserRound } from 'lucide-react-native';
import { BarangayPicker } from '@/components/barangay-picker';
import { BrandMark } from '@/components/brand-mark';
import { cancelScheduledCollectionReminders, scheduleCollectionReminders } from '@/lib/notifications';
import { clearSession, getSession, saveSession, type AuthSession } from '@/lib/session';
import { type ApiWasteType, type LegacyScheduleData, type ScheduleData, type UpcomingCollection } from '@/types/resident-schedule';

type ResidentTab = 'home' | 'schedule' | 'report' | 'profile';

type ResidentReference = {
  _id?: string;
  id?: string;
};

type ApiReport = {
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

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');
const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL?.replace(/\/$/, '') || API_URL?.replace(/\/api\/?$/, '');
const CITY = 'Naga City';

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

function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM' && hours === 12) hours = 0;
  else if (period === 'PM' && hours !== 12) hours += 12;
  return { hours, minutes };
}

function isWithinAnyTimeWindow(timeWindows: string[]): boolean {
  if (!timeWindows.length) return true;
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  return timeWindows.some((window) => {
    const parts = window.split(/\s*[-–]\s*/);
    if (parts.length !== 2) return false;
    const start = parseTimeString(parts[0]);
    const end = parseTimeString(parts[1]);
    if (!start || !end) return false;
    const startMin = start.hours * 60 + start.minutes;
    const endMin = end.hours * 60 + end.minutes;
    return currentMinutes >= startMin && currentMinutes <= endMin;
  });
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
      <View style={styles.bannerCheck}><Feather color="#ffffff" name="truck" size={18} /></View>
      <View style={styles.bannerTextWrap}>
        <Text style={styles.bannerTitle}>Collection is happening right now</Text>
        <Text style={styles.bannerSubtitle}>{barangay} · {toWasteLabel(collection.wasteType)}</Text>
      </View>
      <Pressable accessibilityLabel="Dismiss collection update" hitSlop={10} onPress={onDismiss}>
        <Feather color="#dcfff0" name="x" size={22} strokeWidth={2.5} />
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
            <Feather color="#315043" name={isExpanded ? 'chevron-up' : 'chevron-down'} size={24} />
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

      {isExpanded ? (
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
      ) : null}
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
    <View accessibilityLiveRegion="polite" style={[styles.realtimeStatus, statusStyle]}>
      <View style={styles.realtimeStatusDot} />
      <Text style={styles.realtimeStatusText}>{realtimeStatusText(status)}</Text>
    </View>
  );
}

function ReportStatusTracker({ status }: { status: ApiReport['status'] }) {
  const normalized = status.toLowerCase();
  const currentStep = normalized === 'resolved' ? 2 : normalized === 'verified' || normalized === 'scheduled' ? 1 : 0;
  const rejected = normalized === 'rejected';
  const stages = ['Submitted', 'Acknowledged\nScheduled', 'Resolved'];

  return (
    <View style={styles.reportStatusTracker}>
      <Text style={styles.trackerTitle}>STATUS TRACKER</Text>
      {rejected ? (
        <Text style={styles.rejectedTrackerText}>This report was rejected.</Text>
      ) : (
        <View style={styles.trackerStages}>
          {stages.map((stage, index) => (
            <View key={stage} style={styles.trackerStage}>
              {index < stages.length - 1 ? <View style={[styles.trackerConnector, index < currentStep && styles.trackerConnectorActive]} /> : null}
              <View style={[styles.trackerDot, index <= currentStep && styles.trackerDotActive]}>
                {index < currentStep ? <Feather color="#ffffff" name="check" size={10} /> : null}
              </View>
              <Text style={[styles.trackerLabel, index <= currentStep && styles.trackerLabelActive]}>{stage}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: ResidentTab; onChange: (tab: ResidentTab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs = [
    { key: 'home' as const, label: 'Home', icon: House },
    { key: 'schedule' as const, label: 'News', icon: Newspaper },
    { key: 'report' as const, label: 'Complaint', icon: MessageCircleWarning },
    { key: 'profile' as const, label: 'Profile', icon: UserRound },
  ];

  return (
    <View style={[styles.bottomNav, { height: 78 + insets.bottom, paddingBottom: insets.bottom }]}>
      {tabs.map((tab) => {
        const active = activeTab === tab.key;
        const Icon = tab.icon;
        return (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: active }} key={tab.key} onPress={() => onChange(tab.key)} style={styles.navItem}>
            <Icon color={active ? '#008c68' : '#4A4A4A'} size={24} strokeWidth={1.5} />
            <Text style={[styles.navText, active && styles.navTextActive]}>{tab.label}</Text>
            {active ? <View style={styles.navIndicator} /> : <View style={styles.navIndicatorPlaceholder} />}
          </Pressable>
        );
      })}
    </View>
  );
}

function HomeSectionLabel({ label, onViewAll }: { label: string; onViewAll?: () => void }) {
  return (
    <View style={styles.homeSectionRow}>
      <View style={styles.homeSectionBar} />
      <View style={styles.homeSectionContent}>
        <Text style={styles.homeSectionLabel}>{label}</Text>
        {onViewAll ? (
          <Pressable accessibilityRole="button" onPress={onViewAll}>
            <Text style={styles.viewAll}>View All</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function ReportList({ reports, onSelect, showPhoto }: { reports: ApiReport[]; onSelect: (report: ApiReport) => void; showPhoto?: boolean }) {
  if (!reports.length) {
    return <Text style={styles.complaintsEmpty}>No complaints yet. Tap + to message SWMO Support.</Text>;
  }

  return (
    <>
      {reports.map((report) => (
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
              <View style={styles.complaintIcon}><Feather color="#ffffff" name="message-circle" size={20} /></View>
            )}
            <View style={styles.complaintCopy}>
              <Text numberOfLines={1} style={styles.complaintSubject}>{getReportSubject(report)}</Text>
              <Text numberOfLines={1} style={styles.complaintPreview}>{formatDate(report.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })} · {getReportBody(report)}</Text>
            </View>
            <View style={styles.complaintMeta}>
              <StatusPill status={report.status} />
            </View>
            <Feather color="#8a9b92" name="chevron-right" size={17} />
          </View>
        </Pressable>
      ))}
    </>
  );
}

export default function ResidentScreen() {
  const router = useRouter();
  const { tab } = useLocalSearchParams<{ tab?: string }>();
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<ResidentTab>(tab === 'schedule' ? 'schedule' : 'home');
  const [showBanner, setShowBanner] = useState(true);
  const [isSignOutConfirmVisible, setIsSignOutConfirmVisible] = useState(false);
  const [showAllUpcoming, setShowAllUpcoming] = useState(false);
  const [session, setSession] = useState<AuthSession | null>(null);
  const [schedule, setSchedule] = useState<ScheduleData | null>(null);
  const [isLoadingSchedule, setIsLoadingSchedule] = useState(false);
  const [scheduleError, setScheduleError] = useState('');
  const [pastReports, setPastReports] = useState<ApiReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<ApiReport | null>(null);
  const [isLoadingReports, setIsLoadingReports] = useState(false);
  const [reportError, setReportError] = useState('');
  const [selectedPhoto, setSelectedPhoto] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [photoMetadata, setPhotoMetadata] = useState<ApiReport['photoMetadata'] | null>(null);
  const [reportSubject, setReportSubject] = useState('');
  const [description, setDescription] = useState('');
  const [isCreatingReport, setIsCreatingReport] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reportMessage, setReportMessage] = useState('');
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profilePhone, setProfilePhone] = useState('');
  const [profileLocation, setProfileLocation] = useState('');
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileMessage, setProfileMessage] = useState('');
  const [socketStatus, setSocketStatus] = useState<SocketStatus>('unavailable');
  const socketRef = useRef<ReturnType<typeof io> | null>(null);
  const selectedReportIdRef = useRef('');
  const [reportMessages, setReportMessages] = useState<ApiReportMessage[]>([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');

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
      const response = await fetch(`${API_URL}/resident/schedule`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = (await response.json()) as ApiResponse<ScheduleData | LegacyScheduleData>;
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
    if (session?.token) void loadSchedule(session.token, session.user.location || session.user.barangay);
  }, [loadReports, loadSchedule, session?.token, session?.user.barangay, session?.user.location]);

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
    fetch(`${API_URL}/resident/reports/${encodeURIComponent(reportId)}/messages`, {
      headers: { Authorization: `Bearer ${session.token}` },
    })
      .then(async (response) => {
        const result = (await response.json()) as ApiResponse<ApiReportMessage[]>;
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
  }, [selectedReport?._id, session?.token]);

  useEffect(() => {
    if (tab === 'schedule') setActiveTab('schedule');
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

    const handleConnect = () => setSocketStatus('connected');
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

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleConnectError);
    socket.on('complaint:created', handleComplaintEvent);
    socket.on('complaint:status-updated', handleComplaintEvent);
    socket.on('complaint:message-created', handleMessageEvent);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleConnectError);
      socket.off('complaint:created', handleComplaintEvent);
      socket.off('complaint:status-updated', handleComplaintEvent);
      socket.off('complaint:message-created', handleMessageEvent);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [loadReports, session?.token, session?.user._id, session?.user.id]);

  useEffect(() => {
    setProfileName(session?.user.name || '');
    setProfilePhone(session?.user.phone || '');
    setProfileLocation(session?.user.location || session?.user.barangay || '');
  }, [session?.user.barangay, session?.user.location, session?.user.name, session?.user.phone]);

  const displayName = session?.user.name?.trim() || 'Resident';
  const firstInitial = displayName.charAt(0).toUpperCase();
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
    if (!selectedReport) return null;

    return (
      <Modal animationType="slide" onRequestClose={() => setSelectedReport(null)} transparent visible>
        <View style={styles.reportModalBackdrop}>
          <Pressable accessibilityLabel="Close report details" onPress={() => setSelectedReport(null)} style={styles.reportModalDismissArea} />
          <View style={[styles.reportDetailsSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.reportDetailsHeader}>
              <Pressable accessibilityLabel="Back to complaints" accessibilityRole="button" onPress={() => setSelectedReport(null)} style={styles.reportDetailsBack}>
                <Feather color="#07815f" name="chevron-left" size={23} />
              </Pressable>
              <View style={styles.reportDetailsHeaderText}>
                <Text style={styles.reportDetailsEyebrow}>SWMO SUPPORT</Text>
                <Text numberOfLines={1} style={styles.reportDetailsTitle}>{getReportSubject(selectedReport)}</Text>
              </View>
              <StatusPill status={selectedReport.status} />
            </View>

            <ScrollView contentContainerStyle={styles.reportDetailsContent} showsVerticalScrollIndicator={false}>
              {selectedReport.photoUrl ? (
                <Image accessibilityLabel="Submitted waste photo" resizeMode="cover" source={{ uri: selectedReport.photoUrl }} style={styles.reportDetailsPhoto} />
              ) : (
                <View style={styles.reportNoPhotoCard}>
                  <MaterialCommunityIcons color="#07815f" name="image-off-outline" size={28} />
                  <Text style={styles.reportNoPhotoText}>Submitted photo unavailable</Text>
                </View>
              )}

              <View style={styles.reportDetailsStatusRow}>
                <StatusPill status={selectedReport.status} />
                <Text style={styles.reportDetailsDate}>{formatDate(selectedReport.createdAt, { month: 'short', day: 'numeric', year: 'numeric' })}</Text>
              </View>

              <ReportStatusTracker status={selectedReport.status} />

              <Text style={styles.reportDetailsSectionTitle}>REPORT INFORMATION</Text>
              <View style={styles.reportDetailsInfoCard}>
                <View style={styles.reportDetailIcon}><Feather color="#07815f" name="map-pin" size={16} /></View>
                <View style={styles.reportDetailInfoText}>
                  <Text style={styles.reportDetailLabel}>Location</Text>
                  <Text style={styles.reportDetailValue}>{selectedReport.barangay || 'Location not recorded'}</Text>
                </View>
              </View>
              <View style={styles.reportDetailsInfoCard}>
                <View style={styles.reportDetailIcon}><MaterialCommunityIcons color="#07815f" name="sack-outline" size={17} /></View>
                <View style={styles.reportDetailInfoText}>
                  <Text style={styles.reportDetailLabel}>Detected bag count</Text>
                  <Text style={styles.reportDetailValue}>{getDetectedBagCount(selectedReport)}</Text>
                </View>
              </View>

              {selectedReport.description ? (
                <View style={styles.reportDescriptionCard}>
                  <Text style={styles.reportDetailLabel}>Your note</Text>
                  <Text style={styles.reportDescriptionDetail}>{getReportBody(selectedReport)}</Text>
                </View>
              ) : null}

              {selectedReport.photoMetadata ? (
                <View style={styles.reportDescriptionCard}>
                  <Text style={styles.reportDetailLabel}>Photo metadata</Text>
                  <Text style={styles.reportDescriptionDetail}>{selectedReport.photoMetadata.capturedAt ? `Captured ${formatDate(selectedReport.photoMetadata.capturedAt, { dateStyle: 'medium', timeStyle: 'short' })}` : 'Capture time unavailable'}{selectedReport.photoMetadata.latitude != null && selectedReport.photoMetadata.longitude != null ? ` · GPS ${selectedReport.photoMetadata.latitude.toFixed(5)}, ${selectedReport.photoMetadata.longitude.toFixed(5)}` : ''}{selectedReport.photoMetadata.width && selectedReport.photoMetadata.height ? ` · ${selectedReport.photoMetadata.width} × ${selectedReport.photoMetadata.height}px` : ''}</Text>
                </View>
              ) : null}

              <Text style={styles.reportDetailsSectionTitle}>CHAT WITH SWMO</Text>
              <View style={styles.reportChatCard}>
                {isLoadingMessages ? <ActivityIndicator color="#07815f" style={styles.reportChatLoader} /> : null}
                {!isLoadingMessages && !reportMessages.length ? <Text style={styles.reportChatEmpty}>No messages yet. Send a message to the collection team.</Text> : null}
                {!isLoadingMessages && !reportMessages.some((message) => message.senderRole === 'resident') ? <View style={[styles.reportChatMessage, styles.reportChatMessageResident]}><Text style={styles.reportChatSender}>You</Text><Text style={styles.reportChatBody}>{getReportBody(selectedReport)}</Text><Text style={styles.reportChatTime}>{formatDate(selectedReport.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</Text></View> : null}
                {reportMessages.map((message) => {
                  const sender = typeof message.senderId === 'object' ? message.senderId.name || 'Collection team' : message.senderRole === 'resident' ? 'You' : 'Collection team';
                  return <View key={message._id} style={[styles.reportChatMessage, message.senderRole === 'resident' ? styles.reportChatMessageResident : styles.reportChatMessageAdmin]}><Text style={styles.reportChatSender}>{sender}</Text><Text style={styles.reportChatBody}>{message.body}</Text><Text style={styles.reportChatTime}>{formatDate(message.createdAt, { dateStyle: 'medium', timeStyle: 'short' })}</Text></View>;
                })}
                {messageError ? <Text style={styles.errorMessage}>{messageError}</Text> : null}
                <View style={styles.reportChatComposer}><TextInput maxLength={1000} onChangeText={setMessageDraft} placeholder="Write a message..." placeholderTextColor="#9aa69f" style={styles.reportChatInput} value={messageDraft} /><Pressable disabled={isSendingMessage || !messageDraft.trim()} onPress={sendReportMessage} style={[styles.reportChatSend, (isSendingMessage || !messageDraft.trim()) && styles.disabledButton]}><Text style={styles.reportChatSendText}>{isSendingMessage ? '...' : 'Send'}</Text></Pressable></View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  const capturePhoto = async () => {
    setReportMessage('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Camera permission needed', 'Allow camera access to attach a photo of the uncollected waste.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [4, 3], mediaTypes: 'images', quality: 0.8 });
    if (!result.canceled) {
      const asset = result.assets[0];
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
    }
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
      setReportSubject('');
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
      const response = await fetch(`${API_URL}/auth/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${session.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: profileName.trim(),
          phone: profilePhone.trim(),
          location: profileLocation.trim(),
          // Keep the legacy field populated until all existing accounts migrate.
          barangay: profileLocation.trim(),
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
  const isCollectionTimeNow = todayCollection ? isWithinAnyTimeWindow(todayCollection.timeWindows) : false;
  const bannerSlide = useRef(new Animated.Value(-90)).current;

  useEffect(() => {
    Animated.timing(bannerSlide, {
      toValue: showBanner && todayCollection && isCollectionTimeNow ? 0 : -90,
      duration: 280,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [bannerSlide, showBanner, todayCollection, isCollectionTimeNow]);

  const upcomingCollections = useMemo(() => schedule?.upcomingCollections || [], [schedule?.upcomingCollections]);
  useEffect(() => {
    if (!session?.token || session.user.role !== 'resident' || !schedule) return;

    void scheduleCollectionReminders(upcomingCollections, schedule.location || location).catch((error) => {
      console.warn('Collection reminder scheduling failed:', error);
    });
  }, [location, schedule, session?.token, session?.user.role, upcomingCollections]);

  const visibleUpcomingCollections = showAllUpcoming ? upcomingCollections : upcomingCollections.slice(0, 3);
  const nextCollectionEntry = schedule?.upcomingCollections.find((collection) => (
    schedule.nextCollection && dateKey(collection.date) === dateKey(schedule.nextCollection)
  ));
  const nextTimeWindows = nextCollectionEntry?.timeWindows
    || schedule?.schedules.find((entry) => entry.wasteType === schedule.nextWasteType)?.timeWindows
    || [];

  const homeScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <HomeSectionLabel label="Next collection" />
      <Card style={styles.nextCollectionCard}>
        {isLoadingSchedule ? <ActivityIndicator color="#ffffff" style={styles.scheduleLoader} /> : schedule?.nextCollection ? <>
          <Text style={styles.nextDate}>{formatDate(schedule.nextCollection, { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
          <View style={styles.nextInfoRow}><WastePill type={toWasteLabel(schedule.nextWasteType)} /><Text style={styles.nextTime}>{nextTimeWindows.length ? nextTimeWindows.join(' · ') : 'Time unavailable'}</Text></View>
        </> : <Text style={styles.nextDate}>{scheduleError ? 'Schedule unavailable' : 'No upcoming collection'}</Text>}
        <View style={styles.darkDivider} />
        <Text style={styles.reminder}>Segregate food waste, garden waste, and paper into green bags.</Text>
      </Card>

      <HomeSectionLabel label="Weekly schedule" />
      <Card style={styles.card}>
        {isLoadingSchedule ? <ActivityIndicator color="#07815f" style={styles.loadingSchedule} /> : scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : weeklyCollections.length ? weeklyCollections.map((collection) => <View key={collection.date} style={styles.weeklyRow}><Text style={styles.rowDay}>{collection.dayName}</Text><WastePill type={toWasteLabel(collection.wasteType)} /></View>) : <Text style={styles.emptyScheduleText}>No collections scheduled this week.</Text>}
      </Card>

      <HomeSectionLabel label="My recent reports" onViewAll={() => setActiveTab('report')} />
      <Card style={styles.card}>
        {isLoadingReports ? <ActivityIndicator color="#07815f" style={styles.loadingReports} /> : reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : <ReportList onSelect={setSelectedReport} reports={pastReports.slice(0, 2)} showPhoto />
        }
      </Card>
    </ScrollView>
  );

  const scheduleScreen = (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.screenTitle}>Collection Schedule</Text>
      <Text style={styles.screenSubtitle}>{location} · {formatDate(currentWeekDates[0], { month: 'long', year: 'numeric' })}</Text>

      {isLoadingSchedule ? <Card style={styles.card}><ActivityIndicator color="#07815f" style={styles.loadingSchedule} /></Card> : <MonthlyScheduleCalendar collections={upcomingCollections} />}
      {scheduleError ? <Text style={styles.errorMessage}>{scheduleError}</Text> : null}

      <Card style={styles.card}>
        <View style={styles.cardTopRow}><Text style={styles.cardHeading}>UPCOMING COLLECTIONS</Text>{upcomingCollections.length > 3 ? <Pressable accessibilityRole="button" onPress={() => setShowAllUpcoming((visible) => !visible)}><Text style={styles.viewAll}>{showAllUpcoming ? 'Show Less' : 'View All'}</Text></Pressable> : null}</View>
        {isLoadingSchedule ? <ActivityIndicator color="#07815f" style={styles.loadingSchedule} /> : visibleUpcomingCollections.length ? visibleUpcomingCollections.map((collection) => <View key={collection.date} style={[styles.upcomingRow, collection.wasteType === 'biodegradable' ? styles.upcomingBio : styles.upcomingNonBio]}><View><Text style={styles.collectionDate}>{formatDate(collection.date, { weekday: 'short', month: 'short', day: 'numeric' })}</Text><Text style={styles.collectionTime}>{collection.timeWindows.length ? collection.timeWindows.join(' · ') : 'Time unavailable'}</Text></View><WastePill type={toWasteLabel(collection.wasteType)} /></View>) : <Text style={styles.emptyScheduleText}>No upcoming collections found.</Text>}
      </Card>
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

        <Pressable accessibilityRole="button" onPress={capturePhoto} style={[styles.reportAttachment, !selectedPhoto && styles.reportAttachmentEmpty]}>
          {selectedPhoto ? <Image source={{ uri: selectedPhoto.uri }} style={styles.reportAttachmentImage} /> : <><View style={styles.reportAttachmentIcon}><Feather color="#07815f" name="camera" size={18} /></View><View style={styles.reportAttachmentCopy}><Text style={styles.reportAttachmentTitle}>Add a photo</Text><Text style={styles.reportAttachmentSubtitle}>A photo helps verify your report.</Text></View><Feather color="#8a9b92" name="plus" size={18} /></>}
          {selectedPhoto ? <View style={styles.reportAttachmentOverlay}><Feather color="#ffffff" name="check-circle" size={15} /><Text style={styles.reportAttachmentOverlayText}>Photo attached · Tap to retake</Text></View> : null}
        </Pressable>

        <TextInput multiline onChangeText={setDescription} placeholder="What happened? Write a message..." placeholderTextColor="#9aa69f" style={styles.reportChatDraftInput} value={description} />
        {selectedPhoto ? <View style={styles.photoMetadataHint}><Feather color="#07815f" name="info" size={14} /><Text style={styles.photoMetadataHintText}>Capture time, location, size, and file type will be included.</Text></View> : null}
        {reportMessage ? <Text accessibilityRole="alert" style={reportMessage.includes('submitted') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text> : null}
        <View style={styles.reportChatComposerActions}><Pressable onPress={capturePhoto} style={styles.retakeButton}><Feather color="#07815f" name="camera" size={15} /><Text style={styles.retakeText}>{selectedPhoto ? 'Retake photo' : 'Take photo'}</Text></Pressable><Pressable disabled={isSubmitting} onPress={submitReport} style={[styles.submitButton, isSubmitting && styles.disabledButton]}>{isSubmitting ? <ActivityIndicator color="#ffffff" /> : <><Feather color="#ffffff" name="send" size={15} /><Text style={styles.submitButtonText}>Send report</Text></>}</Pressable></View>
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
        <Pressable accessibilityLabel="Back to complaints" accessibilityRole="button" onPress={() => { setIsCreatingReport(false); setReportMessage(''); }} style={styles.newComplaintBack}>
          <Feather color="#07815f" name="chevron-left" size={23} />
        </Pressable>
        <View style={styles.newComplaintHeaderText}>
          <Text style={styles.newComplaintTitle}>New complaint</Text>
          <Text style={styles.newComplaintSubtitle}>SWMO Support · Naga City</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.newComplaintContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Text style={styles.fieldLabel}>SUBJECT</Text>
        <TextInput onChangeText={setReportSubject} placeholder="e.g. Missed collection on Gen. Luna St." placeholderTextColor="#9aa69f" style={styles.newComplaintInput} value={reportSubject} />
        <Text style={styles.fieldLabel}>MESSAGE</Text>
        <TextInput multiline onChangeText={setDescription} placeholder="Describe the issue — street, number of bags, how long it has been there..." placeholderTextColor="#9aa69f" style={[styles.newComplaintInput, styles.newComplaintMessageInput]} value={description} />
        <Text style={styles.fieldLabel}>PHOTO PROOF</Text>
        <Pressable accessibilityRole="button" onPress={capturePhoto} style={[styles.reportAttachment, !selectedPhoto && styles.reportAttachmentEmpty]}>
          {selectedPhoto ? <Image source={{ uri: selectedPhoto.uri }} style={styles.reportAttachmentImage} /> : <><View style={styles.reportAttachmentIcon}><Feather color="#07815f" name="image" size={18} /></View><View style={styles.reportAttachmentCopy}><Text style={styles.reportAttachmentTitle}>Attach photo</Text><Text style={styles.reportAttachmentSubtitle}>Required · helps SWMO verify your report.</Text></View><Feather color="#8a9b92" name="plus" size={18} /></>}
          {selectedPhoto ? <View style={styles.reportAttachmentOverlay}><Feather color="#ffffff" name="check-circle" size={15} /><Text style={styles.reportAttachmentOverlayText}>Photo attached · Tap to retake</Text></View> : null}
        </Pressable>
        {selectedPhoto ? <View style={styles.photoMetadataHint}><Feather color="#07815f" name="info" size={14} /><Text style={styles.photoMetadataHintText}>Capture time, location, size, and file type will be included.</Text></View> : null}
        {reportMessage ? <Text accessibilityRole="alert" style={reportMessage.startsWith('Complaint sent') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text> : null}
        <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={submitReport} style={[styles.newComplaintSendButton, isSubmitting && styles.disabledButton]}>
          {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <><Feather color="#ffffff" name="send" size={16} /><Text style={styles.submitButtonText}>Send complaint</Text></>}
        </Pressable>
      </ScrollView>
    </View>
  ) : (
    <View style={styles.complaintsPage}>
      <View style={styles.complaintsHeader}>
        <View>
          <Text style={styles.complaintsTitle}>Complaints</Text>
          <Text style={styles.complaintsSubtitle}>Direct line to SWMO Support</Text>
        </View>
        <Pressable accessibilityLabel="New complaint" accessibilityRole="button" onPress={() => { setReportSubject(''); setDescription(''); setSelectedPhoto(null); setPhotoMetadata(null); setReportMessage(''); setIsCreatingReport(true); }} style={styles.complaintPlusButton}>
          <Feather color="#ffffff" name="plus" size={24} />
        </Pressable>
      </View>
      <RealtimeStatus status={socketStatus} />
      <ScrollView contentContainerStyle={styles.complaintsListContent} showsVerticalScrollIndicator={false}>
        {reportMessage ? <Text accessibilityRole="alert" style={reportMessage.startsWith('Complaint sent') ? styles.successMessage : styles.errorMessage}>{reportMessage}</Text> : null}
        <Card style={styles.complaintsListCard}>
          {isLoadingReports ? <ActivityIndicator color="#07815f" style={styles.loadingReports} /> : null}
          {reportError ? <Text style={styles.errorMessage}>{reportError}</Text> : null}
          {!isLoadingReports && !reportError ? <ReportList onSelect={setSelectedReport} reports={pastReports} /> : null}
        </Card>
      </ScrollView>
    </View>
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
          <Text style={styles.profileFieldLabel}>Collection Location</Text>
          <BarangayPicker onChange={setProfileLocation} value={profileLocation} />
          {profileMessage ? <Text accessibilityRole="alert" style={profileMessage === 'Profile updated.' ? styles.successMessage : styles.errorMessage}>{profileMessage}</Text> : null}
          <View style={styles.profileEditActions}>
            <Pressable disabled={isSavingProfile} onPress={() => { setIsEditingProfile(false); setProfileMessage(''); }} style={styles.profileCancelButton}><Text style={styles.profileCancelText}>Cancel</Text></Pressable>
            <Pressable disabled={isSavingProfile} onPress={saveProfile} style={[styles.profileSaveButton, isSavingProfile && styles.disabledButton]}>{isSavingProfile ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.profileSaveText}>Save Changes</Text>}</Pressable>
          </View>
        </> : <>
          <View style={styles.avatar}><Text style={styles.avatarText}>{firstInitial}</Text></View>
          <Text style={styles.profileName}>{displayName}</Text>
          <Text style={styles.profilePhone}>{phone}</Text>
          <Text style={styles.profileLocation}>{location}, {CITY}</Text>
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
      <StatusBar backgroundColor={activeTab === 'home' ? '#EBF7F5' : '#f4f7f5'} style="dark" translucent={false} />
      {activeTab === 'home' && (
        <View style={[styles.residentHeader, { paddingTop: insets.top }]}>
          <View style={styles.brandHeader}>
            <BrandMark height={116} width={206} />
            <View style={styles.headerGreeting}>
              <Text style={styles.headerGreetingText}>Good morning,</Text>
              <Text numberOfLines={1} style={styles.headerName}>{displayName}</Text>
            </View>
          </View>
        </View>
      )}
      <View style={[styles.content, activeTab !== 'home' && { paddingTop: insets.top }]}>{tabScreen}</View>
      {showBanner && todayCollection && isCollectionTimeNow ? <Animated.View pointerEvents="box-none" style={[styles.floatingBannerLayer, { top: insets.top + 42 }, { transform: [{ translateY: bannerSlide }] }]}><View style={styles.bannerWrap}><CollectionBanner barangay={location} collection={todayCollection} onDismiss={() => setShowBanner(false)} /></View></Animated.View> : null}
      <BottomNavigation activeTab={activeTab} onChange={setActiveTab} />
      {renderReportDetails()}
      <SignOutConfirmModal visible={isSignOutConfirmVisible} onCancel={() => setIsSignOutConfirmVisible(false)} onConfirm={completeSignOut} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f7f5' },
  residentHeader: { backgroundColor: '#EBF7F5' },
  brandHeader: { alignItems: 'center', flexDirection: 'row', height: 70, paddingHorizontal: 20 },
  headerGreeting: { alignItems: 'flex-end', flex: 1, marginLeft: 8 },
  headerGreetingText: { color: '#5d7066', fontSize: 12, textAlign: 'right' },
  headerName: { color: '#20372a', fontSize: 18, fontWeight: '800', marginTop: 1, textAlign: 'right' },
  floatingBannerLayer: { left: 0, position: 'absolute', right: 0, zIndex: 20 },
  bannerWrap: { paddingHorizontal: 24 },
  collectionBanner: { alignItems: 'center', backgroundColor: '#06a86c', borderRadius: 13, flexDirection: 'row', minHeight: 52, paddingHorizontal: 12, shadowColor: '#075b3d', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 8 },
  bannerCheck: { alignItems: 'center', borderColor: '#c7ffe6', borderRadius: 12, borderWidth: 1.5, height: 24, justifyContent: 'center', width: 24 },
  bannerTextWrap: { flex: 1, marginLeft: 8 },
  bannerTitle: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  bannerSubtitle: { color: '#d9ffec', fontSize: 10, marginTop: 2 },
  content: { flex: 1 },
  scrollContent: { padding: 13, paddingBottom: 98 },
  greeting: { color: '#5d7066', fontSize: 13, marginTop: 2 },
  name: { color: '#20372a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  location: { color: '#809087', fontSize: 11, marginTop: 3 },
  screenTitle: { color: '#1f382a', fontSize: 20, fontWeight: '800', marginTop: 2 },
  screenSubtitle: { color: '#74847b', fontSize: 11, marginTop: 4 },
  realtimeStatus: { alignItems: 'center', borderRadius: 10, flexDirection: 'row', gap: 7, marginTop: 10, paddingHorizontal: 10, paddingVertical: 8 },
  realtimeConnected: { backgroundColor: '#e7f9f0' },
  realtimeConnecting: { backgroundColor: '#fff6e4' },
  realtimeDisconnected: { backgroundColor: '#fff0f2' },
  realtimeStatusDot: { backgroundColor: '#07815f', borderRadius: 4, height: 7, width: 7 },
  realtimeStatusText: { color: '#3f5d51', fontSize: 10, fontWeight: '700' },
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
  viewAll: { color: '#07815f', fontSize: 11, fontWeight: '700' },
  homeSectionRow: { alignItems: 'stretch', flexDirection: 'row', marginTop: 20, marginBottom: 2 },
  homeSectionBar: { backgroundColor: '#07815f', borderRadius: 3, width: 4, marginRight: 0 },
  homeSectionContent: { alignItems: 'center', flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 10 },
  homeSectionLabel: { color: '#20372a', fontSize: 14, fontWeight: '800' },
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
  complaintsHeader: { alignItems: 'center', backgroundColor: '#ffffff', flexDirection: 'row', justifyContent: 'space-between', paddingBottom: 12, paddingHorizontal: 18, paddingTop: 14 },
  complaintsTitle: { color: '#102c20', fontSize: 22, fontWeight: '800' },
  complaintsSubtitle: { color: '#6d7f76', fontSize: 11, marginTop: 3 },
  complaintPlusButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 22, height: 44, justifyContent: 'center', width: 44 },
  complaintsListContent: { paddingBottom: 100 },
  complaintsListCard: { backgroundColor: '#ffffff', borderColor: '#e0e8e3', borderRadius: 0, borderWidth: 1, marginTop: 0, paddingHorizontal: 13 },
  complaintsEmpty: { color: '#89978f', fontSize: 12, paddingVertical: 24, textAlign: 'center' },
  complaintRowPressable: { borderBottomColor: '#edf1ef', borderBottomWidth: 1 },
  complaintRow: { alignItems: 'center', flexDirection: 'row', minHeight: 76, paddingVertical: 10 },
  complaintIcon: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 22, height: 44, justifyContent: 'center', marginRight: 10, width: 44 },
  complaintCopy: { flex: 1, minWidth: 0 },
  complaintSubject: { color: '#203d2f', fontSize: 13, fontWeight: '800' },
  complaintPreview: { color: '#63766c', fontSize: 10, marginTop: 3 },
  complaintMeta: { alignItems: 'flex-end', marginLeft: 5 },
  complaintDate: { color: '#87958e', fontSize: 9, marginBottom: 5 },
  newComplaintHeader: { alignItems: 'center', backgroundColor: '#ffffff', borderBottomColor: '#e5e9e7', borderBottomWidth: 1, flexDirection: 'row', paddingHorizontal: 15, paddingVertical: 12 },
  newComplaintBack: { alignItems: 'center', height: 38, justifyContent: 'center', width: 32 },
  newComplaintHeaderText: { flex: 1, marginLeft: 4 },
  newComplaintTitle: { color: '#102c20', fontSize: 17, fontWeight: '800' },
  newComplaintSubtitle: { color: '#718077', fontSize: 10, marginTop: 2 },
  newComplaintContent: { padding: 18, paddingBottom: 110 },
  newComplaintInput: { backgroundColor: '#ffffff', borderColor: '#dbe5df', borderRadius: 12, borderWidth: 1, color: '#243f31', fontSize: 12, marginTop: 6, minHeight: 44, paddingHorizontal: 12 },
  newComplaintMessageInput: { minHeight: 116, paddingTop: 12, textAlignVertical: 'top' },
  newComplaintSendButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 12, flexDirection: 'row', gap: 7, height: 48, justifyContent: 'center', marginTop: 14 },
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
  reportRowPressable: { borderRadius: 10 },
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
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#e2e9e5', borderTopWidth: 1, flexDirection: 'row', height: 78, paddingTop: 9 },
  navItem: { alignItems: 'center', flex: 1 },
  navText: { color: '#99a7a0', fontSize: 10, fontWeight: '400', marginTop: 4 },
  navTextActive: { color: '#008c68', fontWeight: '600' },
  navIndicator: { backgroundColor: '#008c68', borderRadius: 3, height: 4, marginTop: 5, width: 5 },
  navIndicatorPlaceholder: { height: 4, marginTop: 5, width: 5 },
});
