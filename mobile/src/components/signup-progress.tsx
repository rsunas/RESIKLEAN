import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, Easing, ReduceMotion, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useAppReducedMotion } from '@/hooks/use-app-reduced-motion';
import { AuthColors as C } from '@/constants/theme';

export function SignupProgress({ step }: { step: 1 | 2 }) {
  const reducedMotion = useAppReducedMotion();
  const fill = useSharedValue(step === 2 ? 1 : 0);
  useEffect(() => {
    cancelAnimation(fill);
    const target = step === 2 ? 1 : 0;
    if (reducedMotion) {
      fill.value = target;
    } else {
      fill.value = withTiming(target, { duration: 250, easing: step === 2 ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic), reduceMotion: ReduceMotion.System });
    }
    return () => cancelAnimation(fill);
  }, [step, reducedMotion, fill]);
  const fillStyle = useAnimatedStyle(() => ({ transform: [{ scaleX: fill.value }] }));
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel="Sign up progress" accessibilityValue={{ min: 1, max: 2, now: step, text: `Step ${step} of 2: ${step === 1 ? 'Google account' : 'Your details'}` }} style={styles.row}>
      <View style={styles.column}>
        <View style={styles.track}><View style={styles.fill} /></View>
        <Text style={[styles.label, styles.complete]}>1 · Google account</Text>
      </View>
      <View style={styles.column}>
        <View style={styles.track}><Animated.View style={[styles.fill, styles.animatedFill, fillStyle]} /></View>
        <Text style={[styles.label, styles.rightLabel, step === 2 && styles.complete]}>2 · Your details</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, marginTop: 12 },
  column: { flex: 1, minWidth: 0 },
  track: { height: 6, borderRadius: 3, overflow: 'hidden', backgroundColor: C.track },
  fill: { width: '100%', height: '100%', borderRadius: 3, backgroundColor: C.primary },
  animatedFill: { transformOrigin: 'left' },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginTop: 8 },
  complete: { fontWeight: '700', color: C.darkGreen },
  rightLabel: { textAlign: 'right' },
});
