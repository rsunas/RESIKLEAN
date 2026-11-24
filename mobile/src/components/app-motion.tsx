import { forwardRef, useEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, View, type LayoutChangeEvent, type ModalProps, type PressableProps, type ViewProps } from 'react-native';
import Animated, { cancelAnimation, Easing, FadeIn, FadeOut, LayoutAnimationConfig, ReduceMotion, runOnJS, useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';

export const MOTION = { tab: 180, pill: 250, content: 250, accordion: 200, press: 100, stagger: 40 } as const;
const enterEase = Easing.out(Easing.cubic);
const leaveEase = Easing.in(Easing.cubic);
const timing = (duration: number, leaving = false) => ({ duration, easing: leaving ? leaveEase : enterEase, reduceMotion: ReduceMotion.System });

// Worklets animate ONLY opacity and transforms. No height/width/layout animations.
function slideEnter(dx: number, dy: number, duration = MOTION.content) {
  return () => {
    'worklet';
    return { initialValues: { opacity: 0, transform: [{ translateX: dx }, { translateY: dy }] }, animations: { opacity: withTiming(1, { duration, easing: enterEase }), transform: [{ translateX: withTiming(0, { duration, easing: enterEase }) }, { translateY: withTiming(0, { duration, easing: enterEase }) }] } };
  };
}
function slideExit(dx: number, dy: number, duration = MOTION.content) {
  return () => {
    'worklet';
    return { initialValues: { opacity: 1, transform: [{ translateX: 0 }, { translateY: 0 }] }, animations: { opacity: withTiming(0, { duration, easing: leaveEase }), transform: [{ translateX: withTiming(dx, { duration, easing: leaveEase }) }, { translateY: withTiming(dy, { duration, easing: leaveEase }) }] } };
  };
}

/** Reanimated retains only exiting native views, not another mounted React screen. */
export function TabTransition({ activeKey, children }: PropsWithChildren<{ activeKey: string }>) {
  const reduced = useAppReducedMotion();
  return <View collapsable={false} style={styles.flex}>
    <LayoutAnimationConfig skipEntering>
      <Animated.View key={activeKey} collapsable={false} style={StyleSheet.absoluteFill} entering={reduced ? undefined : FadeIn.duration(MOTION.tab).easing(enterEase)}>{children}</Animated.View>
    </LayoutAnimationConfig>
  </View>;
}

type Rect = { x: number; y: number; width: number; height: number };
export function useSlidingTabPill(activeKey: string) {
  const reduced = useAppReducedMotion();
  const [frames, setFrames] = useState<Record<string, { item?: Rect; icon?: Rect }>>({});
  const x = useSharedValue(0), y = useSharedValue(0), opacity = useSharedValue(0);
  const previous = useRef<string | null>(null);
  const item = frames[activeKey]?.item, icon = frames[activeKey]?.icon;
  const targetX = item && icon ? item.x + icon.x : undefined;
  const targetY = item && icon ? item.y + icon.y : undefined;
  useEffect(() => {
    if (targetX === undefined || targetY === undefined) return;
    cancelAnimation(x); cancelAnimation(y);
    const shouldAnimate = previous.current !== null && previous.current !== activeKey && !reduced;
    x.value = shouldAnimate ? withTiming(targetX, timing(MOTION.pill)) : targetX;
    y.value = shouldAnimate ? withTiming(targetY, timing(MOTION.pill)) : targetY;
    opacity.value = 1;
    previous.current = activeKey;
    return () => { cancelAnimation(x); cancelAnimation(y); };
  }, [activeKey, targetX, targetY, reduced, x, y, opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateX: x.value }, { translateY: y.value }] }));
  const record = (key: string, part: 'item' | 'icon', event: LayoutChangeEvent) => {
    const frame = event.nativeEvent.layout;
    setFrames((current) => {
      const old = current[key]?.[part];
      if (old && old.x === frame.x && old.y === frame.y && old.width === frame.width && old.height === frame.height) return current;
      return { ...current, [key]: { ...current[key], [part]: frame } };
    });
  };
  return {
    indicator: <Animated.View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.pill, animated]} />,
    itemLayout: (key: string, event: LayoutChangeEvent) => record(key, 'item', event),
    iconLayout: (key: string, event: LayoutChangeEvent) => record(key, 'icon', event),
  };
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const MotionPressable = forwardRef<View, PressableProps & { motionDisabled?: boolean }>(function MotionPressable({ style, onPressIn, onPressOut, onHoverIn, onHoverOut, disabled, motionDisabled, ...props }, ref) {
  const reduced = useAppReducedMotion();
  const [pressed, setPressed] = useState(false);
  const [hovered, setHovered] = useState(false);
  const scale = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  useEffect(() => {
    if (disabled) setPressed(false);
    if (disabled || reduced || motionDisabled) { cancelAnimation(scale); scale.value = 1; }
    return () => cancelAnimation(scale);
  }, [disabled, reduced, motionDisabled, scale]);
  return <AnimatedPressable {...props} ref={ref} disabled={disabled}
    style={[typeof style === 'function' ? style({ pressed, hovered }) : style, !motionDisabled && animated]}
    onHoverIn={(event) => { if (typeof style === 'function') setHovered(true); onHoverIn?.(event); }}
    onHoverOut={(event) => { if (typeof style === 'function') setHovered(false); onHoverOut?.(event); }}
    onPressIn={(event) => { if (typeof style === 'function') setPressed(true); if (!disabled && !reduced && !motionDisabled) scale.value = withTiming(0.97, timing(MOTION.press)); onPressIn?.(event); }}
    onPressOut={(event) => { if (typeof style === 'function') setPressed(false); scale.value = reduced || motionDisabled ? 1 : withTiming(1, timing(MOTION.press, true)); onPressOut?.(event); }} />;
});

/** Same native modal, visibility and dismiss callbacks; no navigation interception. */
export function MotionModal({ animationType = 'slide', ...props }: ModalProps) {
  const reduced = useAppReducedMotion();
  return <Modal {...props} animationType={reduced && animationType !== 'none' ? 'fade' : animationType} />;
}

/** Keep just the last detail data available for the native dismiss animation. */
export function useClosingValue<T>(value: T | null) {
  const last = useRef(value);
  useEffect(() => { if (value !== null) last.current = value; }, [value]);
  return value ?? last.current;
}

export function SignupStepTransition({ step, children }: PropsWithChildren<{ step: 1 | 2 }>) {
  const reduced = useAppReducedMotion();
  return <LayoutAnimationConfig skipEntering>
    <Animated.View key={step} collapsable={false} entering={reduced ? FadeIn.duration(MOTION.content).easing(enterEase) : slideEnter(step === 2 ? 12 : -12, 0)} exiting={reduced ? FadeOut.duration(MOTION.content).easing(leaveEase) : slideExit(step === 1 ? -12 : 12, 0)}>{children}</Animated.View>
  </LayoutAnimationConfig>;
}

export function ToastMotion({ children, style, ...props }: ViewProps) {
  const reduced = useAppReducedMotion();
  return <Animated.View {...props} style={style} entering={reduced ? FadeIn.duration(MOTION.content).easing(enterEase) : slideEnter(0, -12)} exiting={reduced ? FadeOut.duration(MOTION.content).easing(leaveEase) : slideExit(0, -12)}>{children}</Animated.View>;
}

export function MotionChevron({ expanded, children }: PropsWithChildren<{ expanded: boolean }>) {
  const reduced = useAppReducedMotion();
  const rotation = useSharedValue(expanded ? 180 : 0);
  useEffect(() => {
    cancelAnimation(rotation);
    rotation.value = reduced ? (expanded ? 180 : 0) : withTiming(expanded ? 180 : 0, timing(MOTION.accordion, !expanded));
    return () => cancelAnimation(rotation);
  }, [expanded, reduced, rotation]);
  const animated = useAnimatedStyle(() => ({ transform: [{ rotateZ: `${rotation.value}deg` }] }));
  return <Animated.View accessible={false} style={animated}>{children}</Animated.View>;
}

export function AccordionBody({ expanded, children }: PropsWithChildren<{ expanded: boolean }>) {
  const reduced = useAppReducedMotion();
  const [mounted, setMounted] = useState(expanded);
  const progress = useSharedValue(expanded ? 1 : 0);
  const revision = useRef(0);
  useEffect(() => {
    const token = ++revision.current;
    cancelAnimation(progress);
    if (expanded) setMounted(true);
    const finish = () => { if (token === revision.current) setMounted(false); };
    if (reduced) { progress.value = expanded ? 1 : 0; setMounted(expanded); }
    else progress.value = withTiming(expanded ? 1 : 0, timing(MOTION.accordion, !expanded), (finished) => { if (finished && !expanded) runOnJS(finish)(); });
    return () => { ++revision.current; cancelAnimation(progress); };
  }, [expanded, reduced, progress]);
  const animated = useAnimatedStyle(() => ({ opacity: progress.value, transform: [{ translateY: reduced ? 0 : -6 * (1 - progress.value) }, { scaleY: reduced ? 1 : 0.96 + 0.04 * progress.value }] }));
  return mounted ? <Animated.View pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'} style={[styles.accordion, animated]}>{children}</Animated.View> : null;
}

/** One first-load batch per resource, never cached initial data or a refresh. */
export function useFirstLoadReveal(loading: boolean, hasData: boolean, pending: boolean, key = '') {
  const cycle = useRef({ key, seen: false, settled: hasData });
  const current = cycle.current;
  const reveal = current.key === key && current.seen && !current.settled && !loading && !pending && hasData;
  useEffect(() => {
    if (cycle.current.key !== key) cycle.current = { key, seen: false, settled: hasData };
    const state = cycle.current;
    if (loading && !hasData) state.seen = true;
    if ((loading && hasData) || (!loading && !pending && (hasData || state.seen))) state.settled = true;
  }, [loading, hasData, pending, key]);
  return reveal;
}

export function RevealRow({ animate, index, children, style }: PropsWithChildren<{ animate: boolean; index: number; style?: ViewProps['style'] }>) {
  const reduced = useAppReducedMotion();
  // FadeIn's initial transform is deliberately avoided: it wouldn't animate it back.
  const entering = !animate || index >= 6 || reduced ? undefined : () => {
    'worklet';
    return { initialValues: { opacity: 0, transform: [{ translateY: 8 }] }, animations: { opacity: withDelay(index * MOTION.stagger, withTiming(1, { duration: MOTION.content, easing: enterEase }), ReduceMotion.System), transform: [{ translateY: withDelay(index * MOTION.stagger, withTiming(0, { duration: MOTION.content, easing: enterEase }), ReduceMotion.System) }] } };
  };
  return <Animated.View style={style} entering={entering}>{children}</Animated.View>;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  pill: { position: 'absolute', left: 0, top: 0, width: 56, height: 32, borderRadius: 16, backgroundColor: '#E3F4EB' },
  accordion: { transformOrigin: 'top' },
});
