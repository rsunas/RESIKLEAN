import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { Card } from 'heroui-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { getSession, type AuthSession } from '@/lib/session';

type CollectorTab = 'map' | 'history' | 'profile';

type Street = {
  name: string;
  barangay: string;
  status: 'Collected' | 'Not Collected';
  time?: string;
};

const PENDING_SYNC = 3;
const AREA_NAME = 'Area 2';
const BARANGAY = 'Brgy. Triangulo';

const ROUTE_HISTORY: Array<{ date: string; streets: Street[] }> = [
  {
    date: 'JUN 28',
    streets: [
      { name: 'Peñafrancia Ave.', barangay: BARANGAY, status: 'Collected', time: '06:12 AM' },
      { name: 'Gen. Luna St.', barangay: BARANGAY, status: 'Not Collected' },
      { name: 'Roxas Ave.', barangay: BARANGAY, status: 'Collected', time: '07:10 AM' },
      { name: 'Elias Angeles St.', barangay: BARANGAY, status: 'Not Collected' },
    ],
  },
  {
    date: 'JUN 27',
    streets: [
      { name: 'Burgos St.', barangay: BARANGAY, status: 'Collected', time: '05:58 AM' },
      { name: 'Lerma St.', barangay: BARANGAY, status: 'Not Collected' },
    ],
  },
];

function ShiftPills() {
  return (
    <View style={styles.shiftPills}>
      <View style={styles.shiftPill}><Text style={styles.shiftPillText}>Day Shift</Text></View>
      <View style={styles.wastePill}><MaterialCommunityIcons color="#60df96" name="leaf" size={13} /><Text style={styles.wastePillText}>Biodegradable</Text></View>
    </View>
  );
}

function PendingBadge() {
  return <View style={styles.pendingBadge}><Feather color="#f1db5d" name="wifi-off" size={12} /><Text style={styles.pendingText}>{PENDING_SYNC} pending sync</Text></View>;
}

function StandardHeader() {
  return (
    <View style={styles.standardHeader}>
      <View>
        <Text style={styles.barangayTitle}>{BARANGAY}</Text>
        <ShiftPills />
      </View>
      <PendingBadge />
    </View>
  );
}

function HistoryHeader() {
  return (
    <View style={styles.historyHeader}>
      <View style={styles.historyHeaderTop}>
        <View>
          <Text style={styles.assignedLabel}>ASSIGNED AREA</Text>
          <View style={styles.areaNameRow}><Feather color="#58dca2" name="map-pin" size={17} /><Text style={styles.areaName}>{AREA_NAME}</Text></View>
          <Text numberOfLines={1} style={styles.streetSubtitle}>Brgy. Triangulo, Peñafrancia Ave., Gen. Luna St.</Text>
        </View>
        <PendingBadge />
      </View>
      <ShiftPills />
    </View>
  );
}

function BottomNavigation({ activeTab, onChange }: { activeTab: CollectorTab; onChange: (tab: CollectorTab) => void }) {
  const insets = useSafeAreaInsets();
  const tabs: Array<{ key: CollectorTab; label: string; icon: 'map-pin' | 'clock' | 'user' }> = [
    { key: 'map', label: 'Map', icon: 'map-pin' },
    { key: 'history', label: 'Route history', icon: 'clock' },
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

function ProgressRing() {
  const size = 59;
  const stroke = 5;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  return (
    <View style={styles.progressRing}>
      <Svg height={size} width={size}>
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} stroke="#5aa687" strokeWidth={stroke} />
        <Circle cx={size / 2} cy={size / 2} fill="none" r={radius} rotation="-90" stroke="#d2ffe8" strokeDasharray={`${circumference} ${circumference}`} strokeDashoffset={circumference * 0.67} strokeLinecap="round" strokeWidth={stroke} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
      </Svg>
      <Text style={styles.progressPercent}>33%</Text>
    </View>
  );
}

function StreetRow({ street }: { street: Street }) {
  const collected = street.status === 'Collected';
  return (
    <Card style={styles.streetCard}>
      <View style={[styles.streetMarker, collected ? styles.collectedMarker : styles.notCollectedMarker]} />
      <View style={styles.streetInfo}>
        <Text style={styles.streetName}>{street.name}</Text>
        <Text style={styles.streetBarangay}>{street.barangay}</Text>
      </View>
      <View style={[styles.streetStatus, collected ? styles.collectedPill : styles.notCollectedPill]}>
        <Text style={[styles.streetStatusText, collected ? styles.collectedText : styles.notCollectedText]}>• {street.status}</Text>
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

  useEffect(() => {
    let isMounted = true;
    getSession().then((savedSession) => {
      if (!savedSession) {
        router.replace('/login');
        return;
      }
      if (isMounted) setSession(savedSession);
    }).catch(() => router.replace('/login'));
    return () => { isMounted = false; };
  }, [router]);

  const collectorName = session?.user.name?.trim() || 'Roel Macaraeg';
  const initial = collectorName.charAt(0).toUpperCase();

  const mapScreen = (
    <View style={styles.mapScreen}>
      <StandardHeader />
      <View style={styles.mapPlaceholder}>
        <View style={styles.mapGridVertical} />
        <View style={styles.mapGridHorizontal} />
        <View style={styles.mapPlaceholderLabel}><Feather color="#4d7e69" name="map" size={17} /><Text style={styles.mapPlaceholderText}>Map view — Mapbox integration pending</Text></View>
        <Card style={styles.legendCard}>
          <View style={styles.legendHeading}><Feather color="#d79d2f" name="flag" size={15} /><Text style={styles.legendTitle}>Priority</Text></View>
          {[['#13b981', 'Collected'], ['#9ea7a1', 'Not Collected'], ['#8d53ce', 'Report']].map(([color, label]) => <View key={label} style={styles.legendRow}><View style={[styles.legendDot, { backgroundColor: color }]} /><Text style={styles.legendText}>{label}</Text></View>)}
        </Card>
      </View>
    </View>
  );

  const historyScreen = (
    <View style={styles.historyScreen}>
      <HistoryHeader />
      <ScrollView contentContainerStyle={styles.historyScrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.progressCard}>
          <View><Text style={styles.progressLabel}>TODAY'S PROGRESS</Text><Text style={styles.progressNumber}>2 <Text style={styles.progressTotal}>/ 6 streets</Text></Text><Text style={styles.progressCaption}>Fully collected</Text></View>
          <ProgressRing />
        </Card>
        {ROUTE_HISTORY.map((group) => <View key={group.date} style={styles.historyGroup}><Text style={styles.dateLabel}>{group.date}</Text>{group.streets.map((street) => <StreetRow key={street.name} street={street} />)}</View>)}
      </ScrollView>
    </View>
  );

  const profileScreen = (
    <View style={styles.profileScreen}>
      <StandardHeader />
      <ScrollView contentContainerStyle={styles.profileScrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.collectorProfileCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
          <Text style={styles.collectorName}>{collectorName}</Text>
          <Text style={styles.collectorRole}>Collector · Route Driver</Text>
          <Text style={styles.collectorBarangay}>{BARANGAY}</Text>
          <View style={styles.profilePills}><View style={styles.collectorPill}><Text style={styles.collectorPillText}>Collector</Text></View><View style={styles.onShiftPill}><Text style={styles.onShiftText}>On Shift</Text></View></View>
        </Card>

        <View style={styles.statsRow}>
          {[['2', 'Collected'], ['2', 'Partial'], ['2', 'Pending']].map(([value, label]) => <Card key={label} style={styles.statCard}><Text style={styles.statValue}>{value}</Text><Text style={styles.statLabel}>{label}</Text><Text style={styles.statCaption}>streets</Text></Card>)}
        </View>

        <Card style={styles.accountCard}>
          <Text style={styles.accountHeading}>ACCOUNT DETAILS</Text>
          <AccountDetail label="Employee ID" value="SWMO-2023-012" />
          <AccountDetail label="Contact" value="09171234567" />
          <AccountDetail label="Email" value="roel@naga.gov.ph" />
          <AccountDetail label="Shift" value="Day Shift · Mon–Sat" />
          <AccountDetail label="Collection Type" value="Biodegradable" />
        </Card>
      </ScrollView>
      <View style={styles.syncBottomBar}><View style={styles.syncBottomTextWrap}><Feather color="#b97917" name="wifi-off" size={15} /><Text style={styles.syncBottomText}>{PENDING_SYNC} updates pending sync</Text></View><Pressable onPress={() => undefined} style={styles.syncButton}><Text style={styles.syncButtonText}>Sync Now</Text></Pressable></View>
    </View>
  );

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
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
  mapGridVertical: { backgroundColor: 'rgba(255,255,255,0.40)', height: '150%', left: '45%', position: 'absolute', top: '-25%', transform: [{ rotate: '27deg' }], width: 18 },
  mapGridHorizontal: { backgroundColor: 'rgba(111,146,126,0.16)', height: 16, left: '-10%', position: 'absolute', top: '48%', transform: [{ rotate: '-20deg' }], width: '120%' },
  mapPlaceholderLabel: { alignItems: 'center', backgroundColor: 'rgba(248,252,249,0.88)', borderColor: '#c2d3c9', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 7, left: 20, paddingHorizontal: 12, paddingVertical: 9, position: 'absolute', right: 20, top: '47%' },
  mapPlaceholderText: { color: '#45685a', fontSize: 11, fontWeight: '700' },
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
  streetCard: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#e1e8e4', borderRadius: 13, borderWidth: 1, flexDirection: 'row', marginBottom: 8, minHeight: 60, paddingHorizontal: 10, shadowColor: '#234837', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 5 },
  streetMarker: { borderRadius: 3, height: 30, width: 5 },
  collectedMarker: { backgroundColor: '#10c990' },
  notCollectedMarker: { backgroundColor: '#d8deda' },
  streetInfo: { flex: 1, marginLeft: 10 },
  streetName: { color: '#2a4134', fontSize: 12, fontWeight: '800' },
  streetBarangay: { color: '#9aa69f', fontSize: 9, marginTop: 3 },
  streetStatus: { alignItems: 'flex-end', borderRadius: 9, paddingHorizontal: 7, paddingVertical: 4 },
  collectedPill: { backgroundColor: '#e8fbf1' },
  notCollectedPill: { backgroundColor: '#fff0f2' },
  streetStatusText: { fontSize: 9, fontWeight: '800' },
  streetTime: { fontSize: 8, marginTop: 2 },
  collectedText: { color: '#07815f' },
  notCollectedText: { color: '#d34b5c' },
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
  syncBottomBar: { alignItems: 'center', backgroundColor: '#ffffff', borderTopColor: '#e0e8e3', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 57, paddingHorizontal: 13 },
  syncBottomTextWrap: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 6 },
  syncBottomText: { color: '#7d6a42', fontSize: 10, fontWeight: '700' },
  syncButton: { backgroundColor: '#07815f', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  syncButtonText: { color: '#ffffff', fontSize: 10, fontWeight: '800' },
  bottomNav: { backgroundColor: '#ffffff', borderTopColor: '#e2e9e5', borderTopWidth: 1, flexDirection: 'row', height: 70, paddingTop: 8 },
  navItem: { alignItems: 'center', flex: 1 },
  navText: { color: '#99a7a0', fontSize: 9, fontWeight: '600', marginTop: 3 },
  navTextActive: { color: '#07815f', fontWeight: '800' },
  navIndicator: { backgroundColor: '#07815f', borderRadius: 3, height: 3, marginTop: 4, width: 4 },
  navIndicatorPlaceholder: { height: 3, marginTop: 4, width: 4 },
});
