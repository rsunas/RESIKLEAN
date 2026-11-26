import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { passwordRecoveryRequest } from '@/lib/password-recovery';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[]; email?: string | string[] }>();
  const linkToken = typeof params.token === 'string' ? params.token : '';
  const linkEmail = typeof params.email === 'string' ? params.email : '';
  const [email, setEmail] = useState(linkEmail);
  const [token, setToken] = useState(linkToken);
  const legacyToken = /^[a-f0-9]{64}$/.test(token.trim());
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [error, setError] = useState('');
  const [complete, setComplete] = useState(false);
  useEffect(() => {
    if (!linkToken) return;
    setToken(linkToken); setComplete(false); setError(''); setPassword(''); setConfirm('');
  }, [linkToken]);
  useEffect(() => { setEmail(linkEmail); }, [linkEmail]);
  async function submit() {
    if (submitting.current) return;
    setError('');
    if (!legacyToken && !/^\d{6}$/.test(token.trim())) { setError('Enter the six-digit reset code from your email.'); return; }
    if (!legacyToken && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Enter the email address that received the code.'); return; }
    if (password.trim().length < 6) { setError('Use a password with at least 6 characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    submitting.current = true; setBusy(true);
    try {
      await passwordRecoveryRequest('reset-password', { email: email.trim(), token: token.trim(), password });
      setComplete(true); setToken(''); setPassword(''); setConfirm('');
      router.setParams({ token: '', email: '' });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to reset your password.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.page}>
    <KeyboardAvoidingView style={authStyles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthHeader title={complete ? 'Password updated' : 'Reset password'} subtitle={complete ? 'Sign in with your new password.' : 'Enter the code from your email and choose a new password.'} />
        <View style={authStyles.body}>
          {!complete ? <>
            {!legacyToken ? <AuthField label="Email address" icon="mail" accessibilityLabel="Email address" autoCapitalize="none" autoCorrect={false}
              keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} editable={!busy} /> : null}
            <AuthField label="Reset code" icon="key" accessibilityLabel="Reset code" autoCapitalize="none" autoCorrect={false}
              keyboardType={legacyToken ? 'default' : 'number-pad'} autoComplete="one-time-code" maxLength={64}
              helper={legacyToken ? undefined : 'Enter the six digits from your email. The code expires in 15 minutes.'}
              value={token} onChangeText={setToken} editable={!busy} />
            <AuthField label="New password" icon="lock" accessibilityLabel="New password" secureTextEntry autoCapitalize="none"
              autoComplete="new-password" value={password} onChangeText={setPassword} editable={!busy} helper="Use at least 6 characters." />
            <AuthField label="Confirm password" icon="lock" accessibilityLabel="Confirm password" secureTextEntry autoCapitalize="none"
              value={confirm} onChangeText={setConfirm} editable={!busy} />
            {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[authStyles.primaryButton, { marginTop: 24 }, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={authStyles.buttonText}>Reset password</Text>}
            </Pressable>
            <AuthFooterLink text="" label="Request a new code" onPress={() => router.replace({ pathname: '/forgot-password', params: { email: email.trim() } } as Href)} />
          </> : null}
          <AuthFooterLink text="" label="Back to sign in" onPress={() => router.replace('/login')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
