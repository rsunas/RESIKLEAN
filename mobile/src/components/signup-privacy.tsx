import { useState } from 'react';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MotionModal as Modal, MotionPressable as Pressable } from '@/components/app-motion';
import { AuthColors as C } from '@/constants/theme';

export const PRIVACY_REQUIRED_MESSAGE = 'Please read and accept the Data Privacy Notice before continuing.';

export function SignupPrivacy({ accepted, onChange, disabled = false }: { accepted: boolean; onChange: (accepted: boolean) => void; disabled?: boolean }) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.section}>
    <View style={styles.row}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="I have read and accept the Data Privacy Notice" accessibilityState={{ checked: accepted, disabled }} disabled={disabled} onPress={() => onChange(!accepted)} style={styles.checkboxTarget}>
        <View style={[styles.checkbox, accepted && styles.checked]}>{accepted && <Feather name="check" size={18} color="#ffffff" />}</View>
      </Pressable>
      <View style={styles.copy}>
        <Text style={styles.description}>I have read the notice and agree to the use of my information for ResiKlean services.</Text>
        <Pressable accessibilityRole="link" accessibilityHint="Opens the Data Privacy Notice" onPress={() => setVisible(true)} style={styles.linkTarget}>
          <Text style={styles.link}>Data Privacy Notice</Text>
        </Pressable>
      </View>
    </View>
    <PrivacyPolicyModal visible={visible} onClose={() => setVisible(false)} />
  </View>;
}

/** The same notice is available before signup and from signed-in profiles. */
export function PrivacyPolicyModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  return <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <SafeAreaView style={styles.backdrop}>
        <View accessibilityViewIsModal style={styles.card}>
          <View style={styles.heading}>
            <Text accessibilityRole="header" style={styles.title}>Data Privacy Notice</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Data Privacy Notice" onPress={onClose} style={styles.close}><Feather name="x" size={22} color={C.ink} /></Pressable>
          </View>
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            <Text style={styles.description}>Please read this notice before creating your ResiKlean account.</Text>
            <Text style={styles.subtitle}>Information used</Text>
            <Text style={styles.description}>Registration uses your name, Google-verified email, phone number, password and selected collection location. If you choose to upload a profile photo or submit a complaint, the app also processes the photos, descriptions, location and submission details you provide.</Text>
            <Text style={styles.subtitle}>Why it is needed</Text>
            <Text style={styles.description}>This information supports sign-in, collection schedules and reminders, complaint handling, waste-management dispatch, route planning and municipal verification.</Text>
            <Text style={styles.subtitle}>Who can access it</Text>
            <Text style={styles.description}>Relevant account and service records are available to authorized waste-management personnel for their work. Google handles email verification, and the app uses service providers for hosting, photo storage, maps and notifications.</Text>
            <Text style={styles.subtitle}>Device permissions and offline work</Text>
            <Text style={styles.description}>Camera, photo and location permissions are requested separately for features that need them. Driver trips can record location while the app is minimized after trip monitoring is enabled. Work saved offline stays on the device until it can sync.</Text>
            <Text style={styles.subtitle}>Your choices and questions</Text>
            <Text style={styles.description}>You can review and update your profile, manage notification settings and device permissions, or contact the Naga City Solid Waste Management Office about your information and requests concerning it. If you do not accept this notice, do not continue registration.</Text>
          </ScrollView>
          <Pressable accessibilityRole="button" onPress={onClose} style={styles.done}><Text style={styles.doneText}>Close notice</Text></Pressable>
        </View>
      </SafeAreaView>
    </Modal>;
}

const styles = StyleSheet.create({
  section: { marginTop: 20 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  checkboxTarget: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  checkbox: { width: 24, height: 24, borderWidth: 1.5, borderColor: C.muted, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: C.primary, borderColor: C.primary },
  copy: { flex: 1, paddingTop: 8 },
  description: { color: C.muted, fontSize: 14, lineHeight: 21 },
  linkTarget: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  link: { color: C.darkGreen, fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
  backdrop: { flex: 1, padding: 20, backgroundColor: 'rgba(13,30,24,0.5)', alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#ffffff', borderRadius: 24, padding: 20, maxWidth: 480, width: '100%', maxHeight: '90%' },
  heading: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '700', color: C.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.field, alignItems: 'center', justifyContent: 'center' },
  scroll: { flexShrink: 1 },
  content: { paddingBottom: 12 },
  subtitle: { color: C.ink, fontSize: 15, fontWeight: '700', marginTop: 18, marginBottom: 6 },
  done: { minHeight: 48, borderRadius: 14, marginTop: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  doneText: { color: '#ffffff', fontSize: 15, fontWeight: '700' },
});
