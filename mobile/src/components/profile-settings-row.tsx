import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { AppText as Text } from '@/components/app-text';
import { ResidentSettingsModal } from '@/components/resident-settings-modal';
import { PrivacyPolicyModal } from '@/components/signup-privacy';
import { useAppTheme } from '@/hooks/app-preferences';
import { getSession, type AuthSession } from '@/lib/session';

/** Opens the same settings modal as Resident Profile; no separate preferences. */
export function ProfileSettingsRow({ onSignOut }: { onSignOut: () => void }) {
  const isDark = useAppTheme() === 'dark';
  const [session, setSession] = useState<AuthSession | null>(null);
  const [visible, setVisible] = useState(false);
  const [privacyVisible, setPrivacyVisible] = useState(false);
  const open = async () => {
    try {
      const current = await getSession();
      if (!current) return;
      setSession(current);
      setVisible(true);
    } catch {
      Alert.alert('Settings', 'Unable to load your account. Please try again.');
    }
  };
  return <>
    <Pressable accessibilityLabel="Settings" accessibilityRole="button" onPress={open} style={[styles.row, isDark && { backgroundColor: '#192A22' }]}>
      <View accessible={false} style={[styles.badge, isDark && { backgroundColor: '#21372C' }]}><Feather name="settings" size={20} color="#0A7F4F" /></View>
      <Text style={[styles.label, isDark && { color: '#F1F6F3' }]}>Settings</Text>
      <Feather name="chevron-right" size={20} color={isDark ? '#85DCB0' : '#5A6761'} />
    </Pressable>
    {session ? <ResidentSettingsModal apiUrl={process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') ?? ''} session={session} visible={visible} onClose={() => setVisible(false)} onSessionUpdate={setSession} onSignOut={onSignOut} /> : null}
    <Pressable accessibilityRole="button" onPress={() => setPrivacyVisible(true)} style={[styles.row, isDark && { backgroundColor: '#192A22' }]}>
      <View accessible={false} style={[styles.badge, isDark && { backgroundColor: '#21372C' }]}><Feather name="shield" size={20} color="#0A7F4F" /></View>
      <Text style={[styles.label, isDark && { color: '#F1F6F3' }]}>Privacy Policy</Text>
      <Feather name="chevron-right" size={20} color={isDark ? '#85DCB0' : '#5A6761'} />
    </Pressable>
    <PrivacyPolicyModal visible={privacyVisible} onClose={() => setPrivacyVisible(false)} />
  </>;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: '#F4F6F5', borderRadius: 16, flexDirection: 'row', gap: 12, marginTop: 12, minHeight: 60, paddingHorizontal: 14, paddingVertical: 12 },
  badge: { alignItems: 'center', backgroundColor: '#E3F4EB', borderRadius: 18, height: 36, width: 36, justifyContent: 'center' },
  label: { color: '#121A16', flex: 1, fontSize: 16, fontWeight: '600' },
});
