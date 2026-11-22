import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { AppText as Text } from '@/components/app-text';
import { collectionDateKey } from '@/lib/collection-reminder-plan';
import { formatCollectionWindow } from '@/lib/collection-window-label';
import { getGuideCategory, GUIDE_UI as UI } from '@/constants/segregation-guide';
import type { UpcomingCollection } from '@/types/resident-schedule';

const ROW_HEIGHT = 84;
const GAP = 8;

export function ResidentWeeklySchedule({ collections, today }: { collections: UpcomingCollection[]; today: string }) {
  const [heights, setHeights] = useState<Record<number, number>>({});
  const visibleCount = Math.min(3, collections.length);
  const height = Array.from({ length: visibleCount }, (_, index) => heights[index] ?? ROW_HEIGHT)
    .reduce((sum, value) => sum + value, 0) + Math.max(0, visibleCount - 1) * GAP;

  return <View>
    <ScrollView accessibilityLabel="Weekly collection schedule, scroll for more days" nestedScrollEnabled showsVerticalScrollIndicator persistentScrollbar scrollEnabled={collections.length > 3} bounces={false} style={{ height, flexGrow: 0 }} contentContainerStyle={styles.list}>
      {collections.map((collection, index) => {
        const day = collectionDateKey(collection.date)!;
        const isToday = day === today;
        const past = day < today;
        const category = getGuideCategory(collection.wasteType)!;
        const date = new Date(day + 'T12:00:00+08:00');
        const weekday = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Manila' });
        const spokenDay = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Manila' });
        const dayNumber = day.slice(-2).replace(/^0/, '');
        const windows = collection.timeWindows.map(window => formatCollectionWindow(window, true)).join(' · ') || 'Time unavailable';
        const color = past ? UI.past : category.dark;
        return <View
          key={day + '-' + collection.wasteType + '-' + index}
          accessible accessibilityLabel={`${spokenDay} ${dayNumber}, ${category.title}, ${windows}${isToday ? ', today' : ''}`}
          onLayout={index < 3 ? event => {
            const measured = Math.ceil(event.nativeEvent.layout.height);
            setHeights(previous => previous[index] === measured ? previous : { ...previous, [index]: measured });
          } : undefined}
          style={[styles.row, { backgroundColor: isToday ? category.tint : 'transparent' }]}
        >
          <View style={styles.date}>
            <Text style={[styles.day, { color }]}>{weekday.toUpperCase()}</Text>
            <Text style={[styles.number, { color }]}>{dayNumber}</Text>
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={[styles.title, { color }]}>{category.title}</Text>
              {isToday ? <View style={[styles.badge, { backgroundColor: category.dark }]}><Text style={styles.badgeText}>TODAY</Text></View> : null}
            </View>
            <Text style={[styles.times, { color: past ? UI.past : UI.muted }]}>{windows}</Text>
          </View>
          <View style={[styles.icon, { backgroundColor: past ? UI.pastCircle : category.fill }]}>
            <MaterialCommunityIcons name={category.icon} size={19} color={past ? UI.mutedIcon : UI.white} />
          </View>
        </View>;
      })}
    </ScrollView>
    {collections.length > 3 ? <Text style={styles.hint}>Scroll for more collection days</Text> : null}
  </View>;
}

const styles = StyleSheet.create({
  list: { gap: GAP, paddingRight: 4 },
  row: { minHeight: ROW_HEIGHT, paddingHorizontal: 14, paddingVertical: 12, borderRadius: UI.radius.row, flexDirection: 'row', alignItems: 'center', gap: 14 },
  date: { width: 48, alignItems: 'center', flexShrink: 0 },
  day: { fontSize: 11, fontWeight: '700', letterSpacing: 1.3 },
  number: { fontSize: 24, fontWeight: '800' },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  title: { fontSize: UI.font.type, fontWeight: '700', flexShrink: 1 },
  badge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3, minHeight: 20, justifyContent: 'center' },
  badgeText: { color: UI.white, fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  times: { fontSize: UI.font.time },
  icon: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  hint: { color: UI.muted, fontSize: 11, textAlign: 'center', marginTop: 8 },
});
