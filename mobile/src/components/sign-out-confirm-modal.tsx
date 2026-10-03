import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { Card } from 'heroui-native';
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '@/components/app-text';

type SignOutConfirmModalProps = {
  visible: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
};

export function SignOutConfirmModal({ visible, onCancel, onConfirm }: SignOutConfirmModalProps) {
  const [isSigningOut, setIsSigningOut] = useState(false);

  const confirmSignOut = async () => {
    setIsSigningOut(true);
    try {
      await onConfirm();
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <Modal animationType="fade" onRequestClose={onCancel} transparent visible={visible}>
      <View style={styles.backdrop}>
        <Card style={styles.card}>
          <View style={styles.icon}><Feather color="#d94855" name="log-out" size={22} /></View>
          <AppText style={styles.title}>Sign out?</AppText>
          <AppText style={styles.message}>Are you sure you want to sign out of this account?</AppText>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" disabled={isSigningOut} onPress={onCancel} style={styles.cancelButton}>
              <AppText style={styles.cancelText}>Cancel</AppText>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={isSigningOut} onPress={() => void confirmSignOut()} style={[styles.confirmButton, isSigningOut && styles.disabledButton]}>
              <AppText style={styles.confirmText}>{isSigningOut ? 'Signing out…' : 'Sign out'}</AppText>
            </Pressable>
          </View>
        </Card>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(12, 37, 27, 0.48)', flex: 1, justifyContent: 'center', padding: 22 },
  card: { backgroundColor: '#ffffff', borderColor: '#dce9e2', borderRadius: 20, borderWidth: 1, maxWidth: 360, padding: 22, width: '100%' },
  icon: { alignItems: 'center', alignSelf: 'center', backgroundColor: '#fff0f1', borderRadius: 25, height: 50, justifyContent: 'center', width: 50 },
  title: { color: '#203b2e', fontSize: 19, fontWeight: '800', marginTop: 14, textAlign: 'center' },
  message: { color: '#718078', fontSize: 13, lineHeight: 20, marginTop: 7, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 9, marginTop: 20 },
  cancelButton: { alignItems: 'center', borderColor: '#cfe0d7', borderRadius: 11, borderWidth: 1, flex: 1, justifyContent: 'center', minHeight: 44 },
  cancelText: { color: '#38604e', fontSize: 12, fontWeight: '800' },
  confirmButton: { alignItems: 'center', backgroundColor: '#d94855', borderRadius: 11, flex: 1, justifyContent: 'center', minHeight: 44 },
  confirmText: { color: '#ffffff', fontSize: 12, fontWeight: '800' },
  disabledButton: { opacity: 0.6 },
});
