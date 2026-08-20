import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { Button, Card, Input } from 'heroui-native';
import { useMemo, useState } from 'react';
import {
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

type Tab = 'input' | 'history' | 'profile';
type PickerKind = 'truck' | 'area' | 'driver' | 'slope' | null;

type Truck = {
  plate: string;
  length: string;
  width: string;
  height: string;
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
};

const TRUCKS: Truck[] = [
  { plate: 'NGC-002', length: '2.8', width: '2.0', height: '1.3' },
  { plate: 'NGC-014', length: '3.2', width: '2.1', height: '1.5' },
  { plate: 'NGC-018', length: '3.5', width: '2.2', height: '1.6' },
];

const AREAS = ['Barangay Triangulo', 'Barangay Dayangdang', 'Barangay Concepcion Grande', 'Barangay Calaauag'];
const DRIVERS = ['Jose Pantua', 'Roel Macaraeg', 'Jun Bustillo', 'Eddie Villanueva'];
const SLOPES = ['0.5 - Moderate Slope', '0.0 - Level Surface', '1.0 - Steep Slope'];

const PLACEHOLDER_HISTORY: Submission[] = [
  { id: '1', barangay: 'Brgy. Triangulo', truckPlate: 'NGC-002', driver: 'Bon Roan', submittedAt: '11:13 PM, Jun 28', length: 9, width: 8, height: 6, slope: '5 m', tonnes: 762.05, status: 'Synced' },
  { id: '2', barangay: 'Brgy. Triangulo', truckPlate: 'NGC-014', driver: 'Roel Macaraeg', submittedAt: '06:45 AM, Jun 28', length: 3.2, width: 2.1, height: 1.5, slope: '0.05 m', tonnes: 21.17, status: 'Synced' },
  { id: '3', barangay: 'Brgy. Dayangdang', truckPlate: 'NGC-002', driver: 'Jun Bustillo', submittedAt: '07:30 AM, Jun 28', length: 2.8, width: 2, height: 1.3, slope: '0.04 m', tonnes: 17.12, status: 'Synced' },
  { id: '4', barangay: 'Brgy. Concepcion Grande', truckPlate: 'NGC-018', driver: 'Eddie Villanueva', submittedAt: '08:15 AM, Jun 27', length: 3.5, width: 2.2, height: 1.6, slope: '0.06 m', tonnes: 26.57, status: 'Synced' },
  { id: '5', barangay: 'Brgy. Calaauag', truckPlate: 'NGC-014', driver: 'Mario Reyes', submittedAt: '04:25 PM, Jun 26', length: 3.2, width: 2.1, height: 1.5, slope: '0.03 m', tonnes: 13.24, status: 'Synced' },
];

const formatTonnage = (tonnes: number) => `${tonnes.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t`;

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

function MeasurementField({ label, value, onChangeText }: { label: string; value: string; onChangeText: (value: string) => void }) {
  return (
    <View style={styles.measurementField}>
      <Text style={styles.measurementLabel}>{label}</Text>
      <View style={styles.measurementInputWrap}>
        <Feather color="#95a49d" name="lock" size={12} />
        <Input
          accessibilityLabel={label}
          keyboardType="decimal-pad"
          onChangeText={onChangeText}
          style={styles.measurementInput}
          value={value}
        />
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
  const [activeTab, setActiveTab] = useState<Tab>('input');
  const [pickerKind, setPickerKind] = useState<PickerKind>(null);
  const [truckPlate, setTruckPlate] = useState(TRUCKS[0].plate);
  const [area, setArea] = useState(AREAS[0]);
  const [driver, setDriver] = useState(DRIVERS[0]);
  const [slope, setSlope] = useState(SLOPES[0]);
  const [length, setLength] = useState(TRUCKS[0].length);
  const [width, setWidth] = useState(TRUCKS[0].width);
  const [height, setHeight] = useState(TRUCKS[0].height);
  const [notes, setNotes] = useState('');
  const [hasAuditPhoto, setHasAuditPhoto] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Submission[]>(PLACEHOLDER_HISTORY);
  const [pendingSync, setPendingSync] = useState(2);

  const totalTonnage = useMemo(() => history.reduce((total, submission) => total + submission.tonnes, 0), [history]);
  const selectedTruck = TRUCKS.find((truck) => truck.plate === truckPlate) ?? TRUCKS[0];

  const pickerOptions = pickerKind === 'truck'
    ? TRUCKS.map((truck) => truck.plate)
    : pickerKind === 'area'
      ? AREAS
      : pickerKind === 'driver'
        ? DRIVERS
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
      const truck = TRUCKS.find((item) => item.plate === option) ?? TRUCKS[0];
      setTruckPlate(truck.plate);
      setLength(truck.length);
      setWidth(truck.width);
      setHeight(truck.height);
    }
    if (pickerKind === 'area') setArea(option);
    if (pickerKind === 'driver') setDriver(option);
    if (pickerKind === 'slope') setSlope(option);
    setPickerKind(null);
  };

  const submitMeasurement = () => {
    const numericLength = Number(length);
    const numericWidth = Number(width);
    const numericHeight = Number(height);

    if (!hasAuditPhoto) {
      setMessage('Attach the audit photo before submitting.');
      return;
    }

    if (!numericLength || !numericWidth || !numericHeight) {
      setMessage('Enter a valid length, width, and height.');
      return;
    }

    // The UI works in metres; the current backend accepts centimetres, so the
    // future API payload should convert these values before POST /staff/truckloads.
    const tonnes = Number((numericLength * numericWidth * numericHeight * 0.3).toFixed(2));
    const submission: Submission = {
      id: Date.now().toString(),
      barangay: area.replace('Barangay', 'Brgy.'),
      truckPlate,
      driver,
      submittedAt: 'Just now',
      length: numericLength,
      width: numericWidth,
      height: numericHeight,
      slope: slope.split(' - ')[0],
      tonnes,
      status: 'Pending',
    };

    setHistory((current) => [submission, ...current]);
    setPendingSync((current) => current + 1);
    setHasAuditPhoto(false);
    setNotes('');
    setMessage('Measurement saved locally and queued for sync.');
    setActiveTab('history');
  };

  const renderInput = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Text style={styles.sectionEyebrow}>NEW MEASUREMENT</Text>
      <Card style={styles.formCard}>
        <SelectField label="Truck" onPress={() => setPickerKind('truck')} value={`${truckPlate} · ${selectedTruck.length}×${selectedTruck.width}×${selectedTruck.height}m`} />
        <SelectField label="Area" onPress={() => setPickerKind('area')} value={area} />
        <SelectField label="Driver" onPress={() => setPickerKind('driver')} value={driver} />

        <View style={styles.measurementRow}>
          <MeasurementField label="Length (m)" onChangeText={setLength} value={length} />
          <MeasurementField label="Width (m)" onChangeText={setWidth} value={width} />
          <MeasurementField label="Height (m)" onChangeText={setHeight} value={height} />
        </View>
        <Text style={styles.helperText}>Measurements are pre-filled from truck {truckPlate}. Adjust when needed.</Text>

        <SelectField label="Slope (m³)" onPress={() => setPickerKind('slope')} value={slope} />

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Audit Photo <Text style={styles.required}>*</Text></Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setHasAuditPhoto(true);
              setMessage('Sample audit photo attached. Camera upload will be enabled with backend support.');
            }}
            style={[styles.photoField, hasAuditPhoto && styles.photoFieldAttached]}>
            <View style={[styles.cameraBadge, hasAuditPhoto && styles.cameraBadgeAttached]}>
              <Feather color={hasAuditPhoto ? '#ffffff' : '#07815f'} name={hasAuditPhoto ? 'check' : 'camera'} size={21} />
            </View>
            <Text style={styles.photoTitle}>{hasAuditPhoto ? 'Audit photo attached' : 'Capture Audit Photo'}</Text>
            <Text style={[styles.photoCaption, hasAuditPhoto && styles.photoCaptionAttached]}>{hasAuditPhoto ? 'Ready to submit' : 'Required to submit'}</Text>
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
        <Button accessibilityRole="button" onPress={submitMeasurement} style={styles.submitButton} variant="primary">
          <Button.Label style={styles.submitButtonLabel}>Submit Measurement</Button.Label>
          <Feather color="#ffffff" name="arrow-right" size={20} />
        </Button>
      </Card>
      <Text style={styles.placeholderNote}>Placeholder mode: truck, driver, photo, and profile data will connect once those backend fields are available.</Text>
    </ScrollView>
  );

  const renderHistory = () => (
    <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <View style={styles.historyTitleRow}>
        <Text style={styles.sectionEyebrow}>SUBMISSION HISTORY</Text>
        <Text style={styles.recordCount}>{history.length} records</Text>
      </View>

      <Card style={styles.totalCard}>
        <View>
          <Text style={styles.totalLabel}>TOTAL TONNAGE</Text>
          <Text style={styles.totalValue}>{formatTonnage(totalTonnage)}</Text>
          <Text style={styles.totalCaption}>All submissions · June 2025</Text>
        </View>
        <View style={styles.totalEntries}>
          <Text style={styles.entriesLabel}>ENTRIES</Text>
          <Text style={styles.entriesValue}>{history.length}</Text>
        </View>
      </Card>

      {history.map((submission) => (
        <Card key={submission.id} style={styles.historyCard}>
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
          </View>
          <View style={styles.historyDetailRow}>
            <Text style={styles.historyDetail}>L {submission.length}m</Text>
            <Text style={styles.historyDetail}>W {submission.width}m</Text>
            <Text style={styles.historyDetail}>H {submission.height}m</Text>
            <Text style={styles.historyDetail}>Slope {submission.slope}</Text>
            {submission.status === 'Pending' ? <Text style={styles.pendingPill}>Pending</Text> : null}
          </View>
        </Card>
      ))}
    </ScrollView>
  );

  const renderProfile = () => {
    const currentMonth = history.length;
    const currentMonthTonnage = history.reduce((total, submission) => total + submission.tonnes, 0);
    return (
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Card style={styles.profileCard}>
          <View style={styles.avatar}><Text style={styles.avatarText}>M</Text></View>
          <Text style={styles.profileName}>Maria Santos</Text>
          <Text style={styles.profileRole}>Staff · Volumetric Auditor</Text>
          <Text style={styles.profileArea}>Brgy. Concepcion Grande</Text>
          <View style={styles.profileBadges}>
            <View style={styles.staffBadge}><Text style={styles.staffBadgeText}>Staff</Text></View>
            <View style={styles.activeBadge}><Text style={styles.activeBadgeText}>Active</Text></View>
          </View>
        </Card>

        <View style={styles.statsRow}>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{currentMonth}</Text>
            <Text style={styles.statLabel}>Submissions</Text>
            <Text style={styles.statCaption}>This month</Text>
          </Card>
          <Card style={styles.statCard}>
            <Text style={styles.statValue}>{formatTonnage(currentMonthTonnage)}</Text>
            <Text style={styles.statLabel}>Total Tonnage</Text>
            <Text style={styles.statCaption}>Computed</Text>
          </Card>
        </View>

        <Card style={styles.accountCard}>
          <Text style={styles.accountHeading}>ACCOUNT DETAILS</Text>
          <DetailRow label="Employee ID" value="SWMO-2024-047" />
          <DetailRow label="Contact" value="09193456789" />
          <DetailRow label="Email" value="maria@naga.gov.ph" />
          <DetailRow label="Assigned Area" value="Brgy. Concepcion Grande" />
          <DetailRow label="Shift" value="Day Shift · Mon–Sat" />
        </Card>
        <Text style={styles.placeholderNote}>Profile details are placeholders; the current user model only stores name, email, role, and optional barangay.</Text>
      </ScrollView>
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
            {pickerOptions.map((option) => (
              <Pressable key={option} onPress={() => chooseOption(option)} style={styles.pickerOption}>
                <Text style={styles.pickerOptionText}>{option}</Text>
                <Feather color="#07815f" name="chevron-right" size={19} />
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
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
  measurementInput: { color: '#526159', flex: 1, fontSize: 14, marginLeft: 6, paddingVertical: 0 },
  helperText: { color: '#96a29b', fontSize: 10, marginTop: 8 },
  photoField: { alignItems: 'center', backgroundColor: '#fbfdfc', borderColor: '#d7e3dc', borderRadius: 16, borderStyle: 'dashed', borderWidth: 1.5, paddingVertical: 20 },
  photoFieldAttached: { backgroundColor: '#f0faf5', borderColor: '#39a17e' },
  cameraBadge: { alignItems: 'center', backgroundColor: '#e7f5ef', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  cameraBadgeAttached: { backgroundColor: '#07815f' },
  photoTitle: { color: '#33463b', fontSize: 13, fontWeight: '800', marginTop: 8 },
  photoCaption: { color: '#d95a65', fontSize: 11, fontWeight: '700', marginTop: 4 },
  photoCaptionAttached: { color: '#14835f' },
  notesInput: { backgroundColor: '#f8faf9', borderColor: '#dce4df', borderRadius: 14, borderWidth: 1, color: '#20362a', fontSize: 14, minHeight: 75, padding: 12 },
  message: { color: '#0c7554', fontSize: 12, fontWeight: '600', lineHeight: 17, marginTop: 12 },
  submitButton: { alignItems: 'center', backgroundColor: '#07815f', borderRadius: 14, flexDirection: 'row', gap: 8, height: 50, justifyContent: 'center', marginTop: 17 },
  submitButtonLabel: { color: '#ffffff', fontSize: 15, fontWeight: '800' },
  placeholderNote: { color: '#829087', fontSize: 11, lineHeight: 16, marginHorizontal: 5, marginTop: 13 },
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
  pickerSheet: { backgroundColor: '#ffffff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, paddingBottom: 32 },
  sheetHandle: { alignSelf: 'center', backgroundColor: '#d6ded9', borderRadius: 3, height: 5, marginBottom: 16, width: 42 },
  pickerTitle: { color: '#20362a', fontSize: 17, fontWeight: '800', marginBottom: 8 },
  pickerOption: { alignItems: 'center', borderBottomColor: '#edf1ee', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 53 },
  pickerOptionText: { color: '#314238', fontSize: 15, fontWeight: '600' },
});
