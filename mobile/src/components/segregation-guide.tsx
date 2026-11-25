import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { useCallback, useEffect, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';
import { useClosingValue } from '@/components/app-motion';
import { SEGREGATION_CATEGORIES, GUIDE_ITEMS, GUIDE_UI as UI, getGuideCategory, type GuideItemId, type GuideCategoryId, type SegregationCategory } from '@/constants/segregation-guide';
import { BIN_IMAGES, ITEM_IMAGES, prefetchGuideBins } from '@/constants/guide-images';

export function useSegregationGuide() {
  const [selected, setSelected] = useState<SegregationCategory | null>(null);
  const openGuide = useCallback((id: GuideCategoryId) => setSelected(getGuideCategory(id) ?? null), []);
  const closeGuide = useCallback(() => setSelected(null), []);
  useEffect(() => { void prefetchGuideBins(); }, []);
  return { selected, openGuide, closeGuide };
}

function CategoryCard({ category, onPress }: { category: SegregationCategory; onPress: () => void }) {
  const styles = useStyles();
  return <Pressable accessibilityRole="button" accessibilityLabel={`${category.title}, opens details`} onPress={onPress} style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}>
    <LinearGradient colors={category.gradient} start={{ x: 0.2, y: 0 }} end={{ x: 0.8, y: 1 }} style={styles.categoryCard}>
      <View style={styles.cardTopRow}>
        <View style={styles.cardIcon}><MaterialCommunityIcons name={category.icon} color="#FFFFFF" size={22} /></View>
        <Feather name="chevron-right" color="#FFFFFF" size={18} />
      </View>
      <Text style={styles.cardTitle}>{category.title}</Text>
      <Text style={styles.cardExamples}>{category.examples}</Text>
    </LinearGradient>
  </Pressable>;
}

function GuideItem({ id, category, excluded, width }: { id: GuideItemId; category: SegregationCategory; excluded?: boolean; width: number }) {
  const themeColor = useThemeColor();
  const styles = useStyles();
  const item = GUIDE_ITEMS[id];
  const photo = ITEM_IMAGES[id];
  return <View accessible accessibilityLabel={`${item.label}, ${excluded ? 'does not go' : 'goes'} in this bin`} style={[styles.item, { width }]}>
    <View style={[styles.circle, { backgroundColor: excluded ? UI.mutedCircle : category.tint }]}>
      {photo ? <View style={[styles.photoFrame, excluded && Platform.OS !== 'ios' && { filter: 'grayscale(1)' }]}><Image source={photo} contentFit="cover" cachePolicy="memory-disk" style={[styles.itemPhoto, excluded && { opacity: 0.6 }]} /></View> : <View style={styles.itemIcon}>
        <MaterialCommunityIcons name={item.icon} size={54} color={excluded ? UI.mutedIcon : UI.ink} style={styles.outlineIcon} />
        <MaterialCommunityIcons name={item.icon} size={48} color={excluded ? '#CBD3CE' : category.fill} />
      </View>}
      {excluded ? <View style={styles.excludedBadge}><Feather name="x" size={15} color={UI.white} /></View> : null}
    </View>
    <Text style={[styles.itemLabel, excluded && { color: themeColor(UI.muted, darkPalette.muted) }]}>{item.label}</Text>
  </View>;
}

export function SegregationGuide({ selected: activeCategory, openGuide, closeGuide }: ReturnType<typeof useSegregationGuide>) {
  const styles = useStyles();
  const selected = useClosingValue(activeCategory);
  const insets = useSafeAreaInsets();
  const { width, height, fontScale } = useWindowDimensions();
  const reduced = useAppReducedMotion();
  // Keep the circles 76px; use two columns on very narrow screens or large text.
  const columns = width < 350 || fontScale > 1.3 ? 2 : 4;
  const itemWidth = (width - 44 - (columns - 1) * 4) / columns;
  const largeText = fontScale > 1.2;
  const narrow = width < 420;
  return <>
    <View style={styles.section}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>Segregation guide</Text>
      <Text style={styles.sectionSubtitle}>Tap a category to see what goes where.</Text>
      <View style={styles.grid}>
        {SEGREGATION_CATEGORIES.map(category => <CategoryCard key={category.id} category={category} onPress={() => openGuide(category.id)} />)}
      </View>
    </View>
    <Modal animationType={reduced ? 'fade' : 'slide'} onRequestClose={closeGuide} statusBarTranslucent transparent visible={activeCategory !== null}>
      {selected ? <View style={styles.modalRoot}>
        <Pressable accessibilityRole="button" accessibilityLabel="Close segregation guide" onPress={closeGuide} style={styles.backdrop} />
        <View accessibilityViewIsModal accessibilityLabel={`${selected.title} guide`} style={[styles.sheet, { maxHeight: height - Math.max(insets.top, 16) }]}>
          <View style={[styles.sheetHeader, { backgroundColor: selected.fill }, largeText && { minHeight: 150, paddingTop: 145 }]}>
            <View style={styles.handle} />
            <View style={[styles.sheetHeadingCopy, { marginRight: largeText ? 0 : narrow ? 132 : 165 }]}>
              <Text accessibilityRole="header" style={[styles.sheetTitle, { fontSize: narrow ? 23 : UI.font.sheetTitle }]}>{selected.title}</Text>
              {selected.id === 'hazardous' ? <View style={styles.warning}><Feather name="alert-triangle" size={18} color={UI.white} /><Text style={styles.warningText}>Handle with care</Text></View> : null}
            </View>
            <Image accessible={false} accessibilityElementsHidden source={BIN_IMAGES[selected.id]} contentFit="contain" cachePolicy="memory-disk" style={[styles.bin, narrow && { width: 128, height: 128, top: 40, right: 8 }]} />
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={closeGuide} style={styles.closeButton}><Feather name="x" size={25} color={UI.white} /></Pressable>
          </View>
          <ScrollView showsVerticalScrollIndicator style={styles.sheetScroll} contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(28, insets.bottom + 16) }]}>
            <Text style={styles.groupLabel}>Goes in this bin</Text>
            <View style={styles.items}>{selected.goesHere.map(id => <GuideItem key={id} id={id} category={selected} width={itemWidth} />)}</View>
            <Text style={styles.groupLabel}>Not in this bin</Text>
            <View style={styles.items}>{selected.keepOut.map(id => <GuideItem key={id} id={id} category={selected} excluded width={itemWidth} />)}</View>
            <View style={[styles.tipStrip, { borderLeftColor: selected.fill }]}>
              <MaterialCommunityIcons name="lightbulb-outline" color={selected.dark} size={24} />
              <Text style={styles.tipText}>{selected.tip}</Text>
            </View>
          </ScrollView>
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
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: UI.backdrop },
  sheet: { backgroundColor: UI.white, borderTopLeftRadius: UI.radius.sheet, borderTopRightRadius: UI.radius.sheet, overflow: 'hidden' },
  sheetHeader: { minHeight: 150, paddingTop: 44, paddingHorizontal: 22, paddingBottom: 24, justifyContent: 'flex-end', flexShrink: 0, zIndex: 1 },
  handle: { position: 'absolute', top: 10, alignSelf: 'center', backgroundColor: 'rgba(255,255,255,0.55)', borderRadius: 3, height: 5, width: 44 },
  sheetHeadingCopy: { minWidth: 0 },
  sheetTitle: { color: UI.white, fontWeight: '800' },
  warning: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
  warningText: { color: UI.white, fontSize: 14, fontWeight: '600', flexShrink: 1 },
  bin: { position: 'absolute', top: 28, right: 20, width: 140, height: 140 },
  closeButton: { position: 'absolute', top: 12, right: 4, alignItems: 'center', height: 44, justifyContent: 'center', width: 44, zIndex: 2 },
  sheetScroll: { flexShrink: 1 },
  sheetContent: { paddingTop: 24, paddingHorizontal: 22, gap: 16 },
  groupLabel: { color: UI.ink, fontSize: UI.font.group, fontWeight: '700', marginTop: 2 },
  items: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 4, rowGap: 16, marginBottom: 6 },
  item: { alignItems: 'center', gap: 8 },
  circle: { width: 76, height: 76, borderRadius: 38, alignItems: 'center', justifyContent: 'center' },
  itemIcon: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  outlineIcon: { position: 'absolute' },
  photoFrame: { width: 76, height: 76, borderRadius: 38, overflow: 'hidden' },
  itemPhoto: { width: 76, height: 76, borderRadius: 38 },
  itemLabel: { color: UI.ink, fontSize: UI.font.item, fontWeight: '600', textAlign: 'center' },
  excludedBadge: { position: 'absolute', top: -2, right: -2, width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: UI.white, backgroundColor: UI.danger, alignItems: 'center', justifyContent: 'center' },
  tipStrip: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 14, borderLeftWidth: 4, borderTopLeftRadius: 4, borderBottomLeftRadius: 4, borderTopRightRadius: 14, borderBottomRightRadius: 14, backgroundColor: UI.tipSurface },
  tipText: { color: UI.ink, flex: 1, fontSize: UI.font.tip, fontWeight: '600' },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  sectionTitle: { color: darkPalette.text },
  sectionSubtitle: { color: darkPalette.muted },
  sheet: { backgroundColor: darkPalette.surface },
  groupLabel: { color: darkPalette.text },
  itemLabel: { color: darkPalette.text },
  excludedBadge: { borderColor: darkPalette.border },
  tipStrip: { backgroundColor: darkPalette.field },
  tipText: { color: darkPalette.text },
};
function useStyles() {
  return useThemedStyles(styles, darkStyles);
}
