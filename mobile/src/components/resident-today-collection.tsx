import { Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { AppText as Text } from '@/components/app-text';
import { BIN_IMAGES } from '@/constants/guide-images';
import { getGuideCategory, GUIDE_UI as UI, type GuideCategoryId } from '@/constants/segregation-guide';
import { formatCollectionWindow } from '@/lib/collection-window-label';

type Collection = { wasteType: GuideCategoryId; timeWindows: string[] };
type Props = { today: string; collections: Collection[]; unavailable: boolean; openGuide: (id: GuideCategoryId) => void };

export function ResidentTodayCollection({ today, collections, unavailable, openGuide }: Props) {
  const { fontScale } = useWindowDimensions();
  const date = new Date(today + 'T12:00:00+08:00');
  const weekday = date.toLocaleDateString('en-PH', { weekday: 'long', timeZone: 'Asia/Manila' });
  const monthDay = date.toLocaleDateString('en-PH', { month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
  if (!collections.length) return <View style={styles.empty}>
    <Text style={styles.emptyDate}>{weekday}, {monthDay}</Text>
    <Text style={styles.emptyText}>{unavailable ? 'Schedule unavailable' : 'No collection scheduled today'}</Text>
  </View>;
  return <View style={styles.stack}>{collections.map((collection, index) => {
    const category = getGuideCategory(collection.wasteType)!;
    const windows = collection.timeWindows.map(window => formatCollectionWindow(window));
    return <LinearGradient key={category.id + index} colors={category.gradient} start={{ x: 0.25, y: 0 }} end={{ x: 0.75, y: 1 }} style={styles.card}>
      <Image accessible={false} accessibilityElementsHidden importantForAccessibility="no" source={BIN_IMAGES[category.id]} contentFit="contain" cachePolicy="memory-disk" style={styles.bin} />
      <View accessible accessibilityLabel={`Today's collection: ${weekday}, ${monthDay}, ${category.title}, ${windows.join(' and ') || 'Time unavailable'}`}>
        <View style={[styles.dateBlock, fontScale > 1.2 && { paddingTop: 108, paddingRight: 0 }]}>
          <Text adjustsFontSizeToFit minimumFontScale={0.7} numberOfLines={1} style={styles.weekday}>{weekday}</Text>
          <Text style={styles.monthDay}>{monthDay}</Text>
        </View>
        <View style={styles.typeRow}>
          <MaterialCommunityIcons name={category.icon} size={20} color={UI.white} />
          <Text style={styles.type}>{category.title}</Text>
        </View>
        <View style={styles.windows}>{windows.length ? windows.map((window, windowIndex) => <View key={windowIndex} style={styles.window}>
          <Feather name="clock" size={14} color={UI.white} /><Text style={styles.windowText}>{window}</Text>
        </View>) : <Text style={styles.windowText}>Time unavailable</Text>}</View>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="See what goes in this bin, opens guide" onPress={() => openGuide(category.id)} style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}>
        <Text style={[styles.buttonText, { color: category.dark }]}>See what goes in this bin</Text>
        <View style={[styles.buttonCircle, { backgroundColor: category.tint }]}><Feather name="chevron-right" size={20} color={category.dark} /></View>
      </Pressable>
    </LinearGradient>;
  })}</View>;
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  card: { borderRadius: UI.radius.card, padding: 18, overflow: 'hidden', gap: 10 },
  bin: { position: 'absolute', top: 8, right: 10, width: 104, height: 104 },
  dateBlock: { paddingRight: 98, minHeight: 94, gap: 4 },
  weekday: { color: UI.white, fontSize: 34, fontWeight: '900' },
  monthDay: { color: 'rgba(255,255,255,0.85)', fontSize: 15, fontWeight: '500' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  type: { color: UI.white, fontSize: UI.font.type, fontWeight: '700', flexShrink: 1 },
  windows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  window: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 34, borderRadius: UI.radius.tile, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(255,255,255,0.16)', maxWidth: '100%' },
  windowText: { color: UI.white, fontSize: UI.font.time, fontWeight: '600', flexShrink: 1 },
  button: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingVertical: 6, paddingLeft: 14, paddingRight: 8, borderRadius: UI.radius.button, backgroundColor: UI.white },
  buttonText: { flex: 1, fontSize: 14, fontWeight: '700' },
  buttonCircle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  empty: { backgroundColor: UI.tipSurface, padding: 18, borderRadius: UI.radius.card, gap: 10 },
  emptyDate: { color: UI.muted, fontSize: 20, fontWeight: '700' },
  emptyText: { color: UI.muted, fontSize: 14 },
});
