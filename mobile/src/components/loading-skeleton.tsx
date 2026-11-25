import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { Skeleton, SkeletonGroup } from 'heroui-native';
import { useEffect, useRef, useState, createContext, useContext, type PropsWithChildren, type ReactNode } from 'react';
import { StyleSheet, View, type DimensionValue } from 'react-native';
import { Easing, FadeIn, FadeOut } from 'react-native-reanimated';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';

/** Presentation timers only: never starts, cancels or changes a data request. */
export function useSkeletonVisible(isLoading: boolean, hasCachedData: boolean, error?: unknown, resourceKey = '') {
  const cycle = useRef({ key: resourceKey, started: 0, seen: false, settled: false });
  const [display, setDisplay] = useState({ key: resourceKey, shownAt: 0, timedOut: false });
  useEffect(() => {
    if (cycle.current.key !== resourceKey) {
      cycle.current = { key: resourceKey, started: 0, seen: false, settled: false };
      setDisplay({ key: resourceKey, shownAt: 0, timedOut: false });
    }
    const current = cycle.current;
    const hide = () => setDisplay((previous) => previous.shownAt ? { ...previous, shownAt: 0 } : previous);
    // Cached/offline content wins immediately, including cache hydration mid-request.
    if (error || (isLoading && hasCachedData)) {
      current.settled = true;
      hide();
      return;
    }
    if (!isLoading) {
      if (current.seen) current.settled = true;
      const remaining = display.key === resourceKey && display.shownAt ? Math.max(0, 400 - (Date.now() - display.shownAt)) : 0;
      const timer = setTimeout(hide, remaining);
      return () => clearTimeout(timer);
    }
    // A refresh may begin during the minimum-display window of an empty result.
    // Its effect cleanup cancels the old hide timer, so release it here as well.
    if (current.settled) { hide(); return; }
    current.seen = true;
    if (!current.started) current.started = Date.now();
    const showTimer = setTimeout(() => setDisplay((previous) => ({ key: resourceKey, shownAt: previous.key === resourceKey && previous.shownAt ? previous.shownAt : Date.now(), timedOut: false })), Math.max(0, 150 - (Date.now() - current.started)));
    const limitTimer = setTimeout(() => {
      current.settled = true;
      setDisplay({ key: resourceKey, shownAt: 0, timedOut: true });
    }, Math.max(0, 10000 - (Date.now() - current.started)));
    return () => { clearTimeout(showTimer); clearTimeout(limitTimer); };
  }, [isLoading, hasCachedData, error, resourceKey, display.key, display.shownAt]);
  const sameKey = display.key === resourceKey;
  const timedOut = sameKey && display.timedOut;
  const visible = sameKey && Boolean(display.shownAt) && !error && !(isLoading && hasCachedData) && !timedOut;
  const pending = visible || (isLoading && !hasCachedData && !error && !timedOut && (cycle.current.key !== resourceKey || !cycle.current.settled));
  return { visible, pending: Boolean(pending), timedOut };
}

export function useSkeletonMotion() {
  return useAppReducedMotion();
}

const animation = { shimmer: { duration: 1500, highlightColor: '#F6F9F7' }, entering: { value: FadeIn.duration(250).easing(Easing.out(Easing.cubic)) }, exiting: { value: FadeOut.duration(250).easing(Easing.in(Easing.cubic)) } };
const InSkeletonGroup = createContext(false);
export type SkeletonState = ReturnType<typeof useSkeletonVisible>;

/** One accessible loading announcement, not dozens of focusable rectangles. */
export function SkeletonRegion({ state, placeholder, children }: PropsWithChildren<{ state: SkeletonState; placeholder: ReactNode }>) {
  const styles = useStyles();
  const reduced = useSkeletonMotion();
  const wasVisible = useRef(false);
  useEffect(() => { if (state.visible) wasVisible.current = true; }, [state.visible]);
  if (!state.pending) return <Skeleton isLoading={false} variant={reduced ? 'none' : 'shimmer'} animation={reduced || !wasVisible.current ? 'disable-all' : animation}>{children}</Skeleton>;
  return <View accessible accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
    <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={!state.visible ? styles.invisible : undefined}>
      <SkeletonGroup isLoading variant={reduced || !state.visible ? 'none' : 'shimmer'} animation={reduced || !state.visible ? undefined : animation}><InSkeletonGroup.Provider value={true}>{placeholder}</InSkeletonGroup.Provider></SkeletonGroup>
    </View>
  </View>;
}

export function SkeletonBlock({ width = '100%', height, radius = 8 }: { width?: DimensionValue; height: number; radius?: number }) {
  const themeColor = useThemeColor();
  const grouped = useContext(InSkeletonGroup);
  const reduced = useSkeletonMotion();
  const Block = grouped ? SkeletonGroup.Item : Skeleton;
  return <Block {...(!grouped ? {isLoading:true, variant: reduced ? 'none' as const : 'shimmer' as const} : {})} accessible={false} focusable={false} style={{ width, height, maxWidth: '100%', borderRadius: radius, backgroundColor: themeColor('#E8EDEA', darkPalette.field), overflow: 'hidden' }} />;
}

type RowKind = 'weekly' | 'report' | 'complaint' | 'account' | 'stop' | 'history' | 'staff' | 'chat' | 'faq';
export function SkeletonRow({ kind, index = 0 }: { kind: RowKind; index?: number }) {
  const styles = useStyles();
  if (kind === 'chat') return <View style={[styles.chat, { alignItems: index % 2 ? 'flex-end' : 'flex-start' }]}><SkeletonBlock width="60%" height={48} radius={18} /></View>;
  if (kind === 'faq') return <View style={styles.weekly}><SkeletonBlock width="70%" height={14} /></View>;
  if (kind === 'weekly') return <View style={styles.weekly}><SkeletonBlock width={96} height={14} /><SkeletonBlock width={118} height={30} radius={10} /></View>;
  if (kind === 'staff') return <View style={styles.staffCard}>
    <View style={styles.row}><View style={styles.copy}><SkeletonBlock width="55%" height={16} /><SkeletonBlock width="40%" height={12} /></View><SkeletonBlock width={56} height={18} /></View>
    <View style={styles.measurements}>{[0, 1, 2, 3].map((item) => <View key={item} style={styles.copy}><SkeletonBlock width={40} height={10} /><SkeletonBlock width={56} height={14} /></View>)}</View>
  </View>;
  const circle = kind === 'complaint' ? 44 : kind === 'account' ? 36 : kind === 'stop' ? 22 : 0;
  return <View style={[styles.row, kind === 'history' ? styles.historyCard : kind === 'stop' ? styles.stop : kind === 'account' ? styles.account : styles.listRow]}>
    <SkeletonBlock width={circle || (kind === 'history' ? 96 : 56)} height={circle || (kind === 'history' ? 96 : 56)} radius={circle ? circle / 2 : 14} />
    <View style={styles.copy}>
      <SkeletonBlock width={kind === 'account' ? 70 : kind === 'report' ? 150 : kind === 'history' ? '60%' : '56%'} height={kind === 'account' ? 10 : kind === 'stop' || kind === 'history' ? 16 : 14} />
      <SkeletonBlock width={kind === 'account' ? 140 : kind === 'report' ? 110 : kind === 'stop' ? 90 : kind === 'history' ? '80%' : '40%'} height={kind === 'account' ? 14 : kind === 'history' || kind === 'stop' ? 12 : 10} />
      {kind === 'history' ? <><SkeletonBlock width={70} height={22} /><SkeletonBlock width={100} height={12} /></> : kind === 'report' || kind === 'complaint' ? <SkeletonBlock width={kind === 'report' ? 92 : 84} height={20} /> : null}
    </View>
    {kind === 'complaint' ? <SkeletonBlock width={20} height={20} /> : kind === 'stop' ? <SkeletonBlock width={52} height={12} /> : null}
  </View>;
}

export function SkeletonRows({ kind, count }: { kind: RowKind; count: number }) {
  return <>{Array.from({ length: count }, (_, index) => <SkeletonRow key={index} kind={kind} index={index} />)}</>;
}

const styles = StyleSheet.create({
  invisible: { opacity: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  copy: { flex: 1, minWidth: 0, gap: 8 },
  weekly: { minHeight: 56, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottomWidth: 1, borderColor: '#E3EAE6' },
  listRow: { minHeight: 88, paddingVertical: 16, borderBottomWidth: 1, borderColor: '#E3EAE6' },
  account: { minHeight: 60, paddingVertical: 12, borderBottomWidth: 1, borderColor: '#E3EAE6' },
  stop: { minHeight: 64, paddingVertical: 12, alignItems: 'flex-start' },
  historyCard: { padding: 12, backgroundColor: '#F4F6F5', borderRadius: 20, marginBottom: 12 },
  staffCard: { paddingVertical: 14, paddingHorizontal: 16, backgroundColor: '#F4F6F5', borderRadius: 20, marginBottom: 12 },
  measurements: { flexDirection: 'row', gap: 8, borderTopWidth: 1, borderColor: '#DCE4DF', paddingTop: 12, marginTop: 12 },
  chat: { paddingVertical: 8 },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  weekly: { borderColor: darkPalette.border },
  listRow: { borderColor: darkPalette.border },
  account: { borderColor: darkPalette.border },
  historyCard: { backgroundColor: darkPalette.field },
  staffCard: { backgroundColor: darkPalette.field },
  measurements: { borderColor: darkPalette.border },
};
function useStyles() {
  return useThemedStyles(styles, darkStyles);
}
