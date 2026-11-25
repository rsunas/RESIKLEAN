import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { UploadSyncBadge } from '@/components/upload-sync-badge';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import { SkeletonBlock, SkeletonRegion, useSkeletonVisible } from '@/components/loading-skeleton';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { MotionModal as Modal, MotionPressable as Pressable } from '@/components/app-motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type StaffSubmissionDetailsData = {
  id: string;
  truckPlate: string;
  barangay: string | string[];
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
  sidePhotoUrl?: string;
  backPhotoUrl?: string;
  photoUrl?: string;
};

type PhotoSlot = 'side' | 'back';

export function formatDetailsArea(area: StaffSubmissionDetailsData['barangay']) {
  // Route.barangay is an array. Rendering it directly in Text concatenates the
  // child strings without separators. This changes presentation, not storage.
  return (Array.isArray(area) ? area.filter(Boolean).join(', ') : area) || 'No area assigned';
}

const formatMeasurement = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export function StaffSubmissionDetails({ submission, onClose, visible = true, syncing = false }: {
  submission: StaffSubmissionDetailsData;
  onClose: () => void;
  visible?: boolean;
  syncing?: boolean;
}) {
  const themeColor = useThemeColor();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  // Preserve the legacy single-photo fallback, without replacing either real
  // side/back image. A component key in Staff resets UI state for each record.
  const legacyOnly = !submission.sidePhotoUrl && !submission.backPhotoUrl;
  const sideUri = submission.sidePhotoUrl || (legacyOnly ? submission.photoUrl : undefined);
  const [slot, setSlot] = useState<PhotoSlot>(sideUri || !submission.backPhotoUrl ? 'side' : 'back');
  const [viewerOpen, setViewerOpen] = useState(false);
  const [failedUris, setFailedUris] = useState<Set<string>>(() => new Set());
  const [loadedUris, setLoadedUris] = useState<Set<string>>(() => new Set());
  const scroll = useRef<ScrollView>(null);
  useEffect(() => {
    if (visible) {
      setSlot(sideUri || !submission.backPhotoUrl ? 'side' : 'back');
      setViewerOpen(false);
      setFailedUris(new Set());
      setLoadedUris(new Set());
      scroll.current?.scrollTo({ y: 0, animated: false });
    }
  }, [visible, sideUri, submission.backPhotoUrl]);
  const photoUri = slot === 'side' ? sideUri : submission.backPhotoUrl;
  const photoLabel = legacyOnly && submission.photoUrl && slot === 'side' ? 'Audit photo' : `${slot === 'side' ? 'Side' : 'Back'} photo`;
  const photoAvailable = Boolean(photoUri && !failedUris.has(photoUri));
  const photoLoaded = Boolean(photoUri && loadedUris.has(photoUri));
  const photoSkeleton = useSkeletonVisible(photoAvailable && !photoLoaded, photoLoaded, !photoAvailable, photoUri);
  const canViewPhoto = photoAvailable && !photoSkeleton.timedOut;
  const markPhotoFailed = () => {
    if (photoUri) setFailedUris((previous) => new Set(previous).add(photoUri));
  };

  // Exactly the calculator's base volume (slope is added separately there).
  const volume = submission.totalVolumeM3 ?? submission.length * submission.width * submission.height;
  const slopeDisplay = submission.measurementMode === 'three-point'
    ? `Average height ${(submission.avgHeightM || 0).toFixed(2)} m`
    : `Base ${(submission.baseVolumeM3 ?? submission.length * submission.width * submission.height).toFixed(2)} m³ + slope ${(submission.slopeVolumeM3 ?? 0).toFixed(2)} m³`;
  const tonnageDisplay = `${formatMeasurement(submission.tonnes)} t`;

  const placeholder = (fullScreen = false) => (
    <View accessibilityLabel={`${photoLabel} unavailable`} style={[styles.placeholder, fullScreen && styles.viewerPlaceholder]}>
      <Feather name="camera" size={28} color={fullScreen ? '#FFFFFF' : themeColor('#5A6761', darkPalette.muted)} />
      <Text style={[styles.placeholderText, fullScreen && styles.viewerText]}>{photoLabel} unavailable</Text>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={[styles.screen, { paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }]}>
        <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            {canViewPhoto ? (
              <ExpoImage key={photoUri} source={{ uri: photoUri }} accessibilityLabel={photoLabel} contentFit="cover" style={styles.heroImage} onError={markPhotoFailed} onLoad={() => { if (photoUri) setLoadedUris((previous) => new Set(previous).add(photoUri)); }} />
            ) : placeholder()}
            {photoSkeleton.pending ? <View pointerEvents="none" style={styles.heroImage}><SkeletonRegion state={photoSkeleton} placeholder={<SkeletonBlock height={210} radius={0} />} /></View> : null}
            <Pressable accessibilityRole="button" accessibilityLabel="Back to submission history" onPress={onClose} style={styles.backButton}>
              <Feather name="chevron-left" color={themeColor("#121A16", darkPalette.text)} size={24} />
            </Pressable>
            <View style={styles.heroControls}>
              <View accessibilityRole="tablist" accessibilityLabel="Submission photos" style={styles.photoTabs}>
                {(['side', 'back'] as const).map((option) => (
                  <Pressable key={option} accessibilityRole="tab" accessibilityLabel={`${option === 'side' ? 'Side' : 'Back'} photo`} accessibilityState={{ selected: slot === option }} onPress={() => setSlot(option)} style={styles.photoTabTarget}>
                    <View pointerEvents="none" collapsable={false} style={[styles.photoTabSurface, slot === option && styles.photoTabSelected]}>
                      <Text numberOfLines={1} style={[styles.photoTabLabel, slot === option && styles.photoTabLabelSelected]}>{option === 'side' ? 'Side' : 'Back'}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="View full photo" accessibilityState={{ disabled: !canViewPhoto }} disabled={!canViewPhoto} onPress={() => setViewerOpen(true)} style={[styles.expandButton, !canViewPhoto && styles.disabledControl]}>
                <Feather name="maximize" color="#FFFFFF" size={22} />
              </Pressable>
            </View>
          </View>

          <View style={styles.titleCard}>
            <View style={styles.titleTopRow}>
              <Text style={styles.eyebrow}>AUDIT SUBMISSION</Text>
              <UploadSyncBadge status={submission.status === 'Synced' ? 'synced' : syncing ? 'syncing' : submission.status === 'Failed' ? 'failed' : 'pending'} />
            </View>
            <Text accessibilityRole="header" style={styles.title}>Truck {submission.truckPlate}</Text>
            <Text style={styles.date}>{submission.submittedAt}</Text>
          </View>

          <View style={styles.cards}>
            {/* No sync timeline: the current data contract has no syncedAt. */}
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>Load details</Text>
              <LoadDetailRow icon="truck" label="Truck" value={submission.truckPlate} />
              <LoadDetailRow icon="map-pin" label="Area" value={formatDetailsArea(submission.barangay)} />
              <LoadDetailRow icon="user" label="Driver" value={submission.driver} />
            </View>
            <View style={styles.card}>
              <Text accessibilityRole="header" style={styles.heading}>Measurements</Text>
              {submission.pileHeightsCm ? <>
                <ReceiptRow label="Front pile height" value={`${submission.pileHeightsCm.front} cm`} />
                <ReceiptRow label="Middle pile height" value={`${submission.pileHeightsCm.middle} cm`} />
                <ReceiptRow label="Back pile height" value={`${submission.pileHeightsCm.back} cm`} />
              </> : null}
              <ReceiptRow label="Additional volume" value={slopeDisplay} />
              <ReceiptRow label="Length" value={`${formatMeasurement(submission.length)} m`} />
              <ReceiptRow label="Width" value={`${formatMeasurement(submission.width)} m`} />
              <ReceiptRow label="Height" value={`${formatMeasurement(submission.height)} m`} />
              <View style={styles.receiptDivider} />
              <ReceiptRow label="Volume" value={`${formatMeasurement(volume)} m³`} />
            </View>
            {submission.notes ? (
              <View style={styles.card}>
                <Text accessibilityRole="header" style={styles.heading}>Notes</Text>
                <Text style={styles.notes}>{submission.notes}</Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={[styles.bottomBar, { paddingBottom: Math.max(28, insets.bottom) }]}>
          <View style={styles.tonnageBlock}>
            <Text style={styles.tonnageLabel}>Estimated tonnage</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.numberScroll}>
              <Text numberOfLines={1} style={styles.tonnageValue}>{tonnageDisplay}</Text>
            </ScrollView>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Done, return to submission history" onPress={onClose} style={styles.doneButton}>
            <Text style={styles.doneText}>Done</Text>
          </Pressable>
        </View>

        {viewerOpen ? (
          <Modal visible animationType="fade" presentationStyle="fullScreen" statusBarTranslucent navigationBarTranslucent onRequestClose={() => setViewerOpen(false)}>
            <View style={[styles.viewer, { paddingTop: insets.top, paddingBottom: insets.bottom, paddingLeft: insets.left, paddingRight: insets.right }]}>
              <View style={styles.viewerToolbar}>
                <Pressable accessibilityRole="button" accessibilityLabel="Back to submission details" onPress={() => setViewerOpen(false)} style={styles.viewerBack}>
                  <Feather name="chevron-left" size={24} color="#FFFFFF" />
                </Pressable>
                <Text style={styles.viewerText}>{photoLabel}</Text>
              </View>
              {canViewPhoto ? <ExpoImage source={{ uri: photoUri }} accessibilityLabel={`Full ${photoLabel.toLowerCase()}`} contentFit="contain" style={styles.fullPhoto} onError={markPhotoFailed} /> : placeholder(true)}
            </View>
          </Modal>
        ) : null}
      </View>
    </Modal>
  );
}

function LoadDetailRow({ icon, label, value }: { icon: 'truck' | 'map-pin' | 'user'; label: string; value: string }) {
  const themeColor = useThemeColor();
  const styles = useStyles();
  return (
    <View style={styles.loadRow}>
      <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.iconBadge}>
        <Feather name={icon} size={20} color={themeColor("#0A7F4F", darkPalette.accent)} />
      </View>
      <View style={styles.loadCopy}>
        <Text style={styles.loadLabel}>{label}</Text>
        <Text style={styles.loadValue}>{value}</Text>
      </View>
    </View>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.receiptValueScroll} contentContainerStyle={styles.receiptValueContent}>
        <Text numberOfLines={1} style={styles.receiptValue}>{value}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#CFE3D8' },
  scroll: { flex: 1, backgroundColor: '#F4F6F5' },
  scrollContent: { paddingBottom: 16 },
  hero: { height: 210, width: '100%', backgroundColor: '#CFE3D8' },
  heroImage: { ...StyleSheet.absoluteFillObject },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 44, gap: 8 },
  placeholderText: { fontFamily: 'Roboto-Regular', fontSize: 14, color: '#35463F' },
  backButton: { position: 'absolute', top: 12, left: 16, width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  heroControls: { position: 'absolute', bottom: 44, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  photoTabs: { flexDirection: 'row', alignItems: 'center', padding: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: 'rgba(18,26,22,0.78)' },
  photoTabTarget: { minWidth: 44, height: 44, justifyContent: 'center' },
  photoTabSurface: { height: 40, paddingHorizontal: 18, borderRadius: 999, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
  photoTabSelected: { borderRadius: 999, backgroundColor: '#FFFFFF' },
  photoTabLabel: { fontSize: 14, fontWeight: '500', color: '#FFFFFF' },
  photoTabLabelSelected: { fontWeight: '600', color: '#121A16' },
  expandButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: 'rgba(18,26,22,0.78)', alignItems: 'center', justifyContent: 'center' },
  disabledControl: { opacity: 0.6 },
  titleCard: { marginTop: -28, backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, borderBottomLeftRadius: 24, borderBottomRightRadius: 24, paddingTop: 22, paddingHorizontal: 20, paddingBottom: 20 },
  titleTopRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  eyebrow: { fontFamily: 'Roboto-Regular', fontSize: 11, fontWeight: '700', letterSpacing: 1, color: '#0A7F4F' },
  title: { fontFamily: 'Roboto-Regular', fontSize: 24, fontWeight: '700', color: '#121A16', marginTop: 6 },
  date: { fontFamily: 'Roboto-Regular', fontSize: 14, color: '#5A6761', marginTop: 6 },
  statusChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontFamily: 'Roboto-Regular', fontSize: 12, fontWeight: '600' },
  cards: { paddingHorizontal: 16, marginTop: 16, gap: 16 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16 },
  heading: { fontFamily: 'Roboto-Regular', fontSize: 16, fontWeight: '700', color: '#121A16', marginBottom: 8 },
  loadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 6 },
  iconBadge: { width: 36, height: 36, flexShrink: 0, borderRadius: 18, backgroundColor: '#E3F4EB', alignItems: 'center', justifyContent: 'center' },
  loadCopy: { flex: 1, minWidth: 0 },
  loadLabel: { fontFamily: 'Roboto-Regular', fontSize: 12, color: '#5A6761' },
  loadValue: { fontFamily: 'Roboto-Regular', fontSize: 15, fontWeight: '600', color: '#121A16', marginTop: 2 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', minHeight: 36, gap: 12, paddingVertical: 4 },
  receiptLabel: { fontFamily: 'Roboto-Regular', fontSize: 15, color: '#5A6761', flexShrink: 0 },
  receiptValueScroll: { flex: 1, minWidth: 0 },
  receiptValueContent: { flexGrow: 1, justifyContent: 'flex-end' },
  receiptValue: { fontFamily: 'Roboto-Regular', fontSize: 15, fontWeight: '600', color: '#121A16', textAlign: 'right' },
  receiptDivider: { borderTopWidth: 1.5, borderStyle: 'dashed', borderColor: '#D5DDD9', marginVertical: 8 },
  notes: { fontFamily: 'Roboto-Regular', fontSize: 15, color: '#121A16', lineHeight: 22 },
  bottomBar: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E3EAE6', paddingTop: 12, paddingHorizontal: 16 },
  tonnageBlock: { flex: 1, minWidth: 0 },
  tonnageLabel: { fontFamily: 'Roboto-Regular', fontSize: 12, color: '#5A6761' },
  numberScroll: { flexGrow: 0, flexShrink: 0 },
  tonnageValue: { fontFamily: 'Roboto-Regular', fontSize: 26, fontWeight: '700', color: '#121A16', fontVariant: ['tabular-nums'], marginTop: 4 },
  doneButton: { width: 132, minHeight: 52, flexShrink: 0, borderRadius: 16, backgroundColor: '#0A7F4F', alignItems: 'center', justifyContent: 'center', paddingVertical: 10 },
  doneText: { fontFamily: 'Roboto-Regular', fontSize: 16, fontWeight: '700', color: '#FFFFFF' },
  viewer: { flex: 1, backgroundColor: '#121A16' },
  viewerToolbar: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  viewerBack: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  viewerText: { fontFamily: 'Roboto-Regular', color: '#FFFFFF', fontSize: 16 },
  fullPhoto: { flex: 1, width: '100%' },
  viewerPlaceholder: { paddingBottom: 0 },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  screen: { backgroundColor: darkPalette.tint },
  scroll: { backgroundColor: darkPalette.field },
  hero: { backgroundColor: darkPalette.tint },
  placeholderText: { color: darkPalette.text },
  backButton: { backgroundColor: darkPalette.surface },
  photoTabSelected: { backgroundColor: darkPalette.surface },
  photoTabLabelSelected: { color: darkPalette.text },
  titleCard: { backgroundColor: darkPalette.surface },
  eyebrow: { color: darkPalette.accent },
  title: { color: darkPalette.text },
  date: { color: darkPalette.muted },
  card: { backgroundColor: darkPalette.surface },
  heading: { color: darkPalette.text },
  iconBadge: { backgroundColor: darkPalette.tint },
  loadLabel: { color: darkPalette.muted },
  loadValue: { color: darkPalette.text },
  receiptLabel: { color: darkPalette.muted },
  receiptValue: { color: darkPalette.text },
  receiptDivider: { borderColor: darkPalette.border },
  notes: { color: darkPalette.text },
  bottomBar: { backgroundColor: darkPalette.surface, borderTopColor: darkPalette.border },
  tonnageLabel: { color: darkPalette.muted },
  tonnageValue: { color: darkPalette.text },
};
function useStyles() {
  return useThemedStyles(styles, darkStyles);
}
