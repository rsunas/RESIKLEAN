import { KeyboardScrollView as ScrollView } from '@/components/keyboard-viewport';
import { KeyboardAvoidingView } from '@/components/keyboard-viewport';
import { useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { passwordRecoveryRequest } from '@/lib/password-recovery';

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const [email, setEmail] = useState(typeof params.email === 'string' ? params.email : '');
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
    try { setMessage(await passwordRecoveryRequest('forgot-password', { email: email.trim(), codeFormat: 'six-digit' })); }
    catch (error) { setError(error instanceof Error ? error.message : 'Unable to send reset instructions.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.page}>
    <KeyboardAvoidingView style={authStyles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthHeader title="Forgot password?" subtitle="Enter your registered email to receive a six-digit reset code." />
        <View style={authStyles.body}>
          <AuthField label="Email address" icon="mail" accessibilityLabel="Email address" autoCapitalize="none" autoCorrect={false}
            keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} />
          {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[authStyles.label, { marginTop: 20 }]}>{message}</Text> : null}
          <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[authStyles.primaryButton, { marginTop: 24 }, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={authStyles.buttonText}>{message ? 'Resend code' : 'Send reset code'}</Text>}
          </Pressable>
          {message ? <Text style={authStyles.helper}>Allow a minute before requesting another email. Use the newest code.</Text> : null}
          <AuthFooterLink text="" label={message ? 'Enter reset code' : 'Already have a reset code?'} onPress={() => router.push({ pathname: '/reset-password', params: { email: email.trim() } } as Href)} />
          <AuthFooterLink text="" label="Back to sign in" onPress={() => router.replace('/login')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
