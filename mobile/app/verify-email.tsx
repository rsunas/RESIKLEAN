import { KeyboardScrollView as ScrollView } from '@/components/keyboard-viewport';
import { KeyboardAvoidingView } from '@/components/keyboard-viewport';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { emailVerificationRequest } from '@/lib/email-verification';

type Step = 'verify' | 'resend' | 'complete';

export default function VerifyEmailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const linkToken = typeof params.token === 'string' ? params.token : '';
  const [step, setStep] = useState<Step>('verify');
  const [token, setToken] = useState(linkToken);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!linkToken) return;
    setToken(linkToken);
    setStep('verify');
    setError('');
    setMessage('');
  }, [linkToken]);

  async function verify() {
    if (submitting.current) return;
    setError('');
    if (!/^[a-f0-9]{64}$/i.test(token.trim())) {
      setError('Paste the full verification code from your email.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    try {
      setMessage(await emailVerificationRequest('verify-email', { token: token.trim().toLowerCase() }));
      setToken('');
      router.setParams({ token: '' });
      setStep('complete');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to verify your email.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  async function resend() {
    if (submitting.current) return;
    setError('');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('Enter a valid email address.');
      return;
    }

    submitting.current = true;
    setBusy(true);
    try {
      setMessage(await emailVerificationRequest('resend-verification', { email: email.trim() }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to resend the verification email.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const complete = step === 'complete';
  const resendMode = step === 'resend';
  const title = complete ? 'Email verified' : resendMode ? 'Resend verification' : 'Verify your email';
  const subtitle = complete
    ? 'Your account is ready. Sign in with the temporary password provided by your administrator.'
    : resendMode
      ? 'Enter the email address used by your administrator. If the account is awaiting verification, a new code will be sent.'
      : 'Paste the verification code from the activation email to finish setting up your account.';

  return <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.page}>
    <KeyboardAvoidingView style={authStyles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthHeader title={title} subtitle={subtitle} />
        <View style={authStyles.body}>
          {!complete && !resendMode ? <AuthField label="Verification code" icon="key" accessibilityLabel="Verification code"
            autoCapitalize="none" autoCorrect={false} autoComplete="one-time-code" editable={!busy}
            placeholder="Paste the code from your email" value={token} onChangeText={setToken} /> : null}
          {!complete && resendMode ? <AuthField label="Email address" icon="mail" accessibilityLabel="Email address"
            autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" editable={!busy}
            placeholder="you@example.com" value={email} onChangeText={setEmail} /> : null}
          {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
          {message ? <Text accessibilityLiveRegion="polite" style={[authStyles.label, { marginTop: 20 }]}>{message}</Text> : null}
          {!complete ? <Pressable accessibilityRole="button" disabled={busy} onPress={resendMode ? resend : verify}
            style={[authStyles.primaryButton, { marginTop: 24 }, busy && authStyles.disabled]}>
            {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={authStyles.buttonText}>{resendMode ? 'Resend verification email' : 'Verify email'}</Text>}
          </Pressable> : null}
          {!complete && !resendMode ? <AuthFooterLink text="Didn't receive an email?" label="Resend code" onPress={() => { setStep('resend'); setError(''); setMessage(''); }} /> : null}
          {resendMode ? <AuthFooterLink text="Already have a code?" label="Verify email" onPress={() => { setStep('verify'); setError(''); setMessage(''); }} /> : null}
          <AuthFooterLink text="" label="Back to sign in" onPress={() => router.replace('/login' as Href)} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
