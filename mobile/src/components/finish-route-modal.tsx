import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { MotionModal as Modal, MotionPressable as Pressable } from '@/components/app-motion';
import { AppText as Text } from '@/components/app-text';
import { ROUTE_FINISH_COUNTDOWN_SECONDS, startRouteFinishCountdown } from '@/lib/route-finish-countdown';

export function FinishRouteModal({ visible, busy = false, onCancel, onConfirm }: {
  visible: boolean; busy?: boolean; onCancel: () => void; onConfirm: () => void;
}) {
  const themeColor = useThemeColor();
  const styles = useStyles();
  const [seconds, setSeconds] = useState<number | null>(null);
  const cancelCountdown = useRef<(() => void) | null>(null);
  const callbacks = useRef({ onCancel, onConfirm, busy });
  callbacks.current = { onCancel, onConfirm, busy };

  const resetCountdown = useCallback(() => {
    cancelCountdown.current?.();
    cancelCountdown.current = null;
    setSeconds(null);
  }, []);

  const dismiss = useCallback(() => {
    if (callbacks.current.busy) return;
    resetCountdown();
    callbacks.current.onCancel();
  }, [resetCountdown]);

  useEffect(() => {
    resetCountdown();
    const subscription = AppState.addEventListener('change', state => {
      // Permission dialogs and system UI can interrupt an online sync. Keep
      // confirmation open, but require a fresh countdown after an interruption.
      if (visible && state !== 'active' && !callbacks.current.busy) resetCountdown();
    });
    return () => {
      cancelCountdown.current?.();
      cancelCountdown.current = null;
      subscription.remove();
    };
  }, [visible, resetCountdown]);

  const beginCountdown = () => {
    if (!visible || callbacks.current.busy || cancelCountdown.current) return;
    cancelCountdown.current = startRouteFinishCountdown(setSeconds, () => {
      if (AppState.currentState !== 'active' && AppState.currentState !== null) {
        resetCountdown();
        return;
      }
      callbacks.current.onConfirm();
    });
  };

  return <Modal animationType="fade" transparent statusBarTranslucent visible={visible} onRequestClose={dismiss}>
    <SafeAreaView style={styles.backdrop}>
      <View accessibilityViewIsModal style={styles.card}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.icon}><Feather name="flag" size={24} color={themeColor("#0A7F4F", darkPalette.accent)} /></View>
          <Text style={styles.eyebrow}>END TODAY'S SHIFT</Text>
          <Text accessibilityRole="header" style={styles.title}>Finish route collection?</Text>
          <Text style={styles.message}>This ends your trip, closes today's route and submits your collection history to admin. Offline records will sync when you reconnect.</Text>
          <Text accessibilityLiveRegion="polite" style={styles.message}>{busy ? 'Saving your route on this phone. Uploads will continue in the background.' : seconds === null
            ? `Your trip keeps recording until you confirm and the ${ROUTE_FINISH_COUNTDOWN_SECONDS}-second safety countdown finishes.`
            : `Finishing in ${seconds} second${seconds === 1 ? '' : 's'}. Tap Keep route open to cancel.`}</Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={busy} onPress={dismiss} style={styles.cancel}>
              <Text style={styles.cancelText}>Keep route open</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || seconds !== null }} disabled={busy || seconds !== null} onPress={beginCountdown} style={[styles.confirm, (busy || seconds !== null) && styles.disabled]}>
              <Text style={styles.confirmText}>{busy ? 'Saving route…' : seconds === null ? 'Finish route' : `Finishing in ${seconds}s`}</Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 22, backgroundColor: 'rgba(13,30,24,0.5)' },
  card: { width: '100%', maxWidth: 420, maxHeight: '90%', borderRadius: 24, backgroundColor: '#ffffff', overflow: 'hidden' },
  content: { padding: 24 },
  icon: { alignSelf: 'center', alignItems: 'center', justifyContent: 'center', width: 64, height: 64, borderRadius: 32, backgroundColor: '#E3F4EB' },
  eyebrow: { marginTop: 18, color: '#0A7F4F', fontSize: 12, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  title: { marginTop: 8, color: '#121A16', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  message: { marginTop: 12, color: '#5A6761', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 24 },
  cancel: { flexGrow: 1, flexBasis: 130, minHeight: 48, padding: 12, borderWidth: 1, borderColor: '#B8D3C3', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  confirm: { flexGrow: 1, flexBasis: 130, minHeight: 48, padding: 12, backgroundColor: '#0A7F4F', borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  disabled: { opacity: 0.6 },
  cancelText: { color: '#086B42', fontSize: 14, fontWeight: '700', textAlign: 'center' },
  confirmText: { color: '#ffffff', fontSize: 14, fontWeight: '700', textAlign: 'center' },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  card: { backgroundColor: darkPalette.surface },
  icon: { backgroundColor: darkPalette.tint },
  eyebrow: { color: darkPalette.accent },
  title: { color: darkPalette.text },
  message: { color: darkPalette.muted },
  cancel: { borderColor: darkPalette.border },
  cancelText: { color: darkPalette.accent },
};
function useStyles() {
  return useThemedStyles(styles, darkStyles);
}
