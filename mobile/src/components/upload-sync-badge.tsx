import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Feather } from 'expo/node_modules/@expo/vector-icons';

export type UploadState = 'pending' | 'syncing' | 'synced' | 'failed' | 'unknown';
const states = {
  pending: { text: 'Waiting to sync', icon: 'cloud-off', color: '#805A10', background: '#FFF3D9' },
  syncing: { text: 'Syncing...', icon: 'refresh-cw', color: '#1D5DAB', background: '#EAF2FF' },
  synced: { text: 'Synced', icon: 'check-circle', color: '#086B42', background: '#E3F4EB' },
  failed: { text: 'Not synced - retry', icon: 'alert-circle', color: '#B3261E', background: '#FDECEA' },
  unknown: { text: 'No GPS points', icon: 'info', color: '#586860', background: '#EFF3F1' },
} as const;

export function UploadSyncBadge({ status, label }: { status: UploadState; label?: string }) {
  const state = states[status];
  const text = label || state.text;
  return <View accessibilityLabel={text} accessibilityLiveRegion="polite" style={[styles.badge, { backgroundColor: state.background }]}>
    {status === 'syncing' ? <ActivityIndicator size="small" color={state.color} /> : <Feather name={state.icon} size={13} color={state.color} />}
    <Text style={[styles.label, { color: state.color }]}>{text}</Text>
  </View>;
}
const styles = StyleSheet.create({
  badge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 5, marginTop: 6, maxWidth: '100%' },
  label: { fontFamily: 'Roboto-Regular', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
