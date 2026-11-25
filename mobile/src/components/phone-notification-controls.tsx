import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles } from '@/hooks/use-themed-styles';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Linking, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/app-text';
import { ensureNotificationPermissionsAsync, getPhoneNotificationStatus, sendPhoneNotificationTest } from '@/lib/notifications';

type Props = { role: 'resident' | 'driver'; tracking?: boolean; compact?: boolean };
export function PhoneNotificationControls({ role, tracking = false, compact = false }: Props) {
  const styles = useStyles();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof getPhoneNotificationStatus>> | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false);
  const refresh = useCallback(async () => {
    try { const next = await getPhoneNotificationStatus(role, tracking); if (mounted.current) setStatus(next); }
    catch { if (mounted.current) setMessage('Unable to check notifications. Open phone settings to check permissions.'); }
  }, [role, tracking]);
  useEffect(() => {
    mounted.current = true;
    void refresh();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const timer = setInterval(() => { if (AppState.currentState === 'active') void refresh(); }, 15000);
    return () => { mounted.current = false; subscription.remove(); clearInterval(timer); };
  }, [refresh]);
  if (Platform.OS === 'web' || (compact && status?.allowed && !message)) return null;
  const run = async (test: boolean) => {
    if (busy) return;
    setBusy(true); setMessage('');
    try {
      if (test) {
        await sendPhoneNotificationTest(role, tracking);
        if (mounted.current) setMessage('Test sent. Pull down the phone notification panel, including silent notifications.');
      } else {
        await ensureNotificationPermissionsAsync({ requestAgain: true });
        const next = await getPhoneNotificationStatus(role, tracking);
        if (!next.allowed) await Linking.openSettings();
      }
      await refresh();
    } catch (error) { if (mounted.current) setMessage(error instanceof Error ? error.message : 'Unable to send a test notification.'); }
    finally { if (mounted.current) setBusy(false); }
  };
  return <View style={styles.card}>
    <Text style={styles.title}>Phone notifications</Text>
    <Text style={styles.body} accessibilityLiveRegion="polite">{message || status?.message || 'Checking notification permission...'}</Text>
    <View style={styles.actions}>
      {!status?.allowed ? <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(false)} style={styles.button}><Text style={styles.buttonText}>Enable notifications</Text></Pressable>
        : <Pressable accessibilityRole="button" disabled={busy} onPress={() => void run(true)} style={styles.button}><Text style={styles.buttonText}>{busy ? 'Sending...' : 'Test notification'}</Text></Pressable>}
      <Pressable accessibilityRole="button" onPress={() => { void Linking.openSettings().catch(() => setMessage('Open Android Settings > Apps > ResiKlean > Notifications.')); }} style={styles.button}><Text style={styles.buttonText}>Phone settings</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  card: { padding: 12, marginVertical: 8, borderRadius: 14, backgroundColor: '#F1F6F3' },
  title: { color: '#183D30', fontWeight: '700', fontSize: 14 },
  body: { color: '#425B50', fontSize: 13, marginTop: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  buttonText: { color: '#086B42', fontWeight: '700', fontSize: 13 },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  card: { backgroundColor: darkPalette.field },
  title: { color: darkPalette.text },
  body: { color: darkPalette.muted },
  buttonText: { color: darkPalette.accent },
};
function useStyles() {
  return useThemedStyles(styles, darkStyles);
}
