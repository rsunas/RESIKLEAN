import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { MotionModal as Modal, MotionPressable as Pressable } from '@/components/app-motion';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AppText as Text } from '@/components/app-text';

type PendingConsent = { promise: Promise<boolean>; resolve: (accepted: boolean) => void };

/** Keep the existing async consent gate; dismiss stale prompts on assignment changes. */
export function useRouteMonitoringConsent(contextKey: string) {
  const [visible, setVisible] = useState(false);
  const pending = useRef<PendingConsent | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const respond = useCallback((accepted: boolean) => {
    const request = pending.current;
    pending.current = null;
    if (mounted.current) setVisible(false);
    request?.resolve(accepted);
  }, []);

  useEffect(() => {
    setVisible(false);
    return () => {
      const request = pending.current;
      pending.current = null;
      request?.resolve(false);
    };
  }, [contextKey]);

  const requestConsent = useCallback((): Promise<boolean> => {
    if (!mounted.current) return Promise.resolve(false);
    if (pending.current) return pending.current.promise;
    let resolve!: (accepted: boolean) => void;
    const promise = new Promise<boolean>((done) => { resolve = done; });
    pending.current = { promise, resolve };
    setVisible(true);
    return promise;
  }, []);

  return { visible, requestConsent, respond };
}

export function RouteMonitoringConsentModal({ visible, onCancel, onEnable }: {
  visible: boolean;
  onCancel: () => void;
  onEnable: () => void;
}) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <SafeAreaView style={styles.backdrop}>
        <ScrollView bounces={false} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          <View accessibilityViewIsModal style={styles.card}>
            <View style={styles.heading}>
              <View accessible={false} style={styles.iconBadge}><Feather name="map-pin" size={24} color="#0A7F4F" /></View>
              <Text accessibilityRole="header" style={styles.title}>Start trip?</Text>
            </View>
            <Text style={styles.message}>Allow ResiKlean to use your location for your assigned route, even while minimized or offline.</Text>
            <View style={styles.details}>
              <View style={styles.detailRow}>
                <Feather accessible={false} name="check-circle" size={18} color="#0A7F4F" />
                <Text style={styles.detailText}>Recording begins with your first accurate GPS reading, even before you reach the assigned route.</Text>
              </View>
              <View style={styles.detailRow}>
                <Feather accessible={false} name="bell" size={18} color="#0A7F4F" />
                <Text style={styles.detailText}>Location notification stays on. Tap End trip when you finish. Offline records sync when you reconnect.</Text>
              </View>
            </View>
            <Text style={styles.permissionHint}>Android may ask for “Allow all the time” access.</Text>
            <View style={styles.actions}>
              <Pressable accessibilityRole="button" testID="route-monitoring-consent-cancel" onPress={onCancel} style={styles.cancelButton}>
                <Text style={styles.cancelText}>Not now</Text>
              </Pressable>
              <Pressable accessibilityRole="button" testID="route-monitoring-consent-enable" onPress={onEnable} style={styles.enableButton}>
                <Text style={styles.enableText}>Start trip</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(18,26,22,0.48)' },
  scrollContent: { flexGrow: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 24, padding: 20, width: '100%', maxWidth: 400 },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconBadge: { backgroundColor: '#E3F4EB', width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center' },
  title: { color: '#121A16', fontSize: 20, fontWeight: '700', flex: 1, minWidth: 0 },
  message: { color: '#5A6761', fontSize: 14, marginTop: 16 },
  details: { backgroundColor: '#F4F6F5', borderRadius: 16, padding: 12, gap: 12, marginTop: 16 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailText: { color: '#35463F', fontSize: 13, flex: 1, minWidth: 0 },
  permissionHint: { color: '#5A6761', fontSize: 12, marginTop: 12 },
  actions: { flexDirection: 'row', gap: 12, marginTop: 20 },
  cancelButton: { backgroundColor: '#EEF3F0', borderRadius: 14, flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12 },
  enableButton: { backgroundColor: '#0A7F4F', borderRadius: 14, flex: 1, minWidth: 0, minHeight: 48, justifyContent: 'center', alignItems: 'center', padding: 12 },
  cancelText: { color: '#35463F', fontSize: 15, fontWeight: '600', textAlign: 'center' },
  enableText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
