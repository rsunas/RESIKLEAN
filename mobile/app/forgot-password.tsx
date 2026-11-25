import { useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useRouter } from 'expo-router';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { passwordRecoveryRequest } from '@/lib/password-recovery';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit() {
    if (submitting.current) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.'); return;
    }
    submitting.current = true; setBusy(true);
    try { setMessage(await passwordRecoveryRequest('forgot-password', { email: email.trim() })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to send reset instructions.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.page}>
    <KeyboardAvoidingView style={authStyles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthHeader title="Forgot password?" subtitle="Enter your registered email to receive password reset instructions." />
        <View style={authStyles.body}>
          <AuthField label="Email address" icon="mail" accessibilityLabel="Email address" autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} />
          {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[authStyles.label, { marginTop: 20 }]}>{message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[authStyles.primaryButton, { marginTop: 24 }, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={authStyles.buttonText}>{message ? 'Resend instructions' : 'Send reset instructions'}</Text>}
          </Pressable>
          {message ? <Text style={authStyles.helper}>Allow a minute before requesting another email. Use the newest code.</Text> : null}
          <AuthFooterLink text="" label="Already have a reset code?" onPress={() => router.push('/reset-password' as Href)} />
          <AuthFooterLink text="" label="Back to sign in" onPress={() => router.replace('/login')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
