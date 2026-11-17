import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import type { ComponentProps } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { SEGREGATION_CATEGORIES, type SegregationCategory } from '@/constants/segregation-guide';
import type { UpcomingCollection } from '@/types/resident-schedule';

type CategoryIcon = ComponentProps<typeof MaterialCommunityIcons>['name'];

function CategoryCard({ category, onPress }: { category: SegregationCategory; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={`${category.title}, opens details`} onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}>
    <LinearGradient colors={category.gradient} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.categoryCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}><MaterialCommunityIcons name={category.icon as CategoryIcon} color="#FFFFFF" size={22} /></View>
        <Feather name="chevron-right" color="#FFFFFF" size={18} />
      </View>
      <Text style={styles.cardTitle}>{category.title}</Text>
      <Text style={styles.cardExamples}>{category.examples}</Text>
    </LinearGradient>
  </Pressable>;
}

export function SegregationGuide({ collections }: { collections: UpcomingCollection[] }) {
  const [selected, setSelected] = useState<SegregationCategory | null>(null);
  const insets = useSafeAreaInsets();
  const collectionDays = useMemo(() => {
    if (!selected?.collectionType) return [];
    return [...new Set(collections.filter(item => item.wasteType === selected.collectionType).map(item => item.dayName.slice(0, 3)))];
  }, [collections, selected]);

  return <>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Segregation guide</Text>
      <Text style={styles.sectionSubtitle}>Tap a category to see what goes where.</Text>
      <View style={styles.grid}>
        {SEGREGATION_CATEGORIES.map(category => <CategoryCard key={category.id} category={category} onPress={() => setSelected(category)} />)}
      </View>
    </View>
    <Modal animationType="fade" onRequestClose={() => setSelected(null)} statusBarTranslucent transparent visible={selected !== null}>
      {selected ? <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close segregation guide" onPress={() => setSelected(null)} style={styles.backdrop} />
        <View accessibilityViewIsModal style={[styles.sheet, { paddingBottom: Math.max(24, insets.bottom) }]}>
          <View style={styles.handle} />
          <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll} contentContainerStyle={styles.sheetContent}>
            <View style={styles.sheetHeader}>
              <View style={[styles.sheetIcon, { backgroundColor: selected.fill }]}><MaterialCommunityIcons name={selected.icon as CategoryIcon} color="#FFFFFF" size={26} /></View>
              <View style={styles.sheetHeadingCopy}>
                <Text accessibilityRole="header" style={[styles.sheetTitle, { color: selected.dark }]}>{selected.title}</Text>
                <Text style={styles.sheetSubtitle}>{selected.subtitle}</Text>
              </View>
              <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => setSelected(null)} style={styles.closeButton}><Feather name="x" size={24} color="#121A16" /></Pressable>
            </View>
            {selected.id === 'hazardous' ? <View style={[styles.warningBanner, { backgroundColor: selected.tint }]}>
              <MaterialCommunityIcons name="alert-outline" size={22} color={selected.dark} />
              <Text style={[styles.warningText, { color: selected.dark }]}>Handle with care. Do not burn, flush or crush these items.</Text>
            </View> : null}
            <Text style={styles.groupLabel}>GOES HERE</Text>
            <View style={styles.chips}>
              {selected.goesHere.map(item => <View key={item} style={[styles.chip, { backgroundColor: selected.tint }]}><Feather name="check" size={16} color={selected.dark} /><Text style={[styles.chipText, { color: selected.dark }]}>{item}</Text></View>)}
            </View>
            <Text style={styles.groupLabel}>KEEP OUT</Text>
            <View style={styles.chips}>
              {selected.keepOut.map(item => <View key={item} style={styles.keepOutChip}><Feather name="x" size={16} color="#A6231D" /><Text style={styles.keepOutText}>{item}</Text></View>)}
            </View>
            {collectionDays.length ? <>
              <Text style={styles.groupLabel}>COLLECTED ON</Text>
              <View style={styles.chips}>{collectionDays.map(day => <View key={day} style={[styles.dayPill, { backgroundColor: selected.dark }]}><Text style={styles.dayText}>{day}</Text></View>)}</View>
            </> : null}
            <Text style={styles.groupLabel}>TIPS</Text>
            <View style={styles.tips}>{selected.tips.map(tip => <View key={tip} style={styles.tipRow}><View style={[styles.tipDot, { backgroundColor: selected.fill }]} /><Text style={styles.tipText}>{tip}</Text></View>)}</View>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={[styles.gotItButton, { backgroundColor: selected.dark }]}><Text style={styles.gotItText}>Got it</Text></Pressable>
        </View>
      </View> : null}
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  section: { marginTop: 24 },
  sectionTitle: { color: '#121A16', fontSize: 20, fontWeight: '700' },
  sectionSubtitle: { color: '#4B5563', fontSize: 14, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 },
  cardPressable: { flexBasis: '48%', flexGrow: 1, minWidth: 0, minHeight: 178 },
  cardPressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  categoryCard: { borderRadius: 20, flex: 1, gap: 10, minHeight: 178, overflow: 'hidden', padding: 14 },
  cardTopRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  cardIcon: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 14, height: 44, justifyContent: 'center', width: 44 },
  cardTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  cardExamples: { color: 'rgba(255,255,255,0.88)', fontSize: 13, lineHeight: 18 },
  modalRoot: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,40,30,0.5)' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '92%', paddingHorizontal: 22, paddingTop: 10 },
  sheetScroll: { flexShrink: 1 },
  handle: { alignSelf: 'center', backgroundColor: '#CFD8D3', borderRadius: 3, height: 5, marginBottom: 20, width: 44 },
  sheetContent: { paddingBottom: 16 },
  sheetHeader: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  sheetIcon: { alignItems: 'center', borderRadius: 28, height: 52, justifyContent: 'center', width: 52 },
  sheetHeadingCopy: { flex: 1, minWidth: 0 },
  sheetTitle: { fontSize: 22, fontWeight: '700' },
  sheetSubtitle: { color: '#4B5563', fontSize: 14, lineHeight: 20, marginTop: 2 },
  closeButton: { alignItems: 'center', height: 44, justifyContent: 'center', width: 44 },
  warningBanner: { alignItems: 'center', borderRadius: 16, flexDirection: 'row', gap: 10, marginTop: 20, padding: 14 },
  warningText: { flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  groupLabel: { color: '#4B5563', fontSize: 12, fontWeight: '700', letterSpacing: 1.4, marginBottom: 10, marginTop: 20 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', gap: 8, minHeight: 36, paddingHorizontal: 12, paddingVertical: 7 },
  chipText: { fontSize: 14, fontWeight: '500' },
  keepOutChip: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: '#D9E2DD', borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 8, minHeight: 36, paddingHorizontal: 12, paddingVertical: 7 },
  keepOutText: { color: '#374151', fontSize: 14 },
  dayPill: { alignItems: 'center', borderRadius: 12, justifyContent: 'center', minHeight: 36, minWidth: 52, paddingHorizontal: 12 },
  dayText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  tips: { gap: 12 },
  tipRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 10 },
  tipDot: { borderRadius: 4, height: 8, marginTop: 7, width: 8 },
  tipText: { color: '#121A16', flex: 1, fontSize: 15, lineHeight: 22 },
  gotItButton: { alignItems: 'center', borderRadius: 16, height: 52, justifyContent: 'center', marginBottom: 8, marginTop: 10 },
  gotItText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
