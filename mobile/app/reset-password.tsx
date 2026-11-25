import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { passwordRecoveryRequest } from '@/lib/password-recovery';

export default function ResetPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const linkToken = typeof params.token === 'string' ? params.token : '';
  const [token, setToken] = useState(linkToken);
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
  async function submit() {
    if (submitting.current) return;
    setError('');
    if (!/^[a-f0-9]{64}$/.test(token.trim())) { setError('Paste the full reset code from your email.'); return; }
    if (password.trim().length < 6) { setError('Use a password with at least 6 characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    submitting.current = true; setBusy(true);
    try {
      await passwordRecoveryRequest('reset-password', { token: token.trim(), password });
      setComplete(true); setToken(''); setPassword(''); setConfirm('');
      router.setParams({ token: '' });
    } catch (error) { setError(error instanceof Error ? error.message : 'Unable to reset your password.'); }
    finally { submitting.current = false; setBusy(false); }
  }
  return <SafeAreaView edges={['left', 'right', 'bottom']} style={authStyles.page}>
    <KeyboardAvoidingView style={authStyles.keyboard} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled">
        <AuthHeader title={complete ? 'Password updated' : 'Reset password'} subtitle={complete ? 'Sign in with your new password.' : 'Paste your email reset code and choose a new password.'} />
        <View style={authStyles.body}>
          {!complete ? <>
            <AuthField label="Reset code" icon="key" accessibilityLabel="Reset code" autoCapitalize="none" autoCorrect={false}
              value={token} onChangeText={setToken} editable={!busy} />
            <AuthField label="New password" icon="lock" accessibilityLabel="New password" secureTextEntry autoCapitalize="none"
              autoComplete="new-password" value={password} onChangeText={setPassword} editable={!busy} helper="Use at least 6 characters." />
            <AuthField label="Confirm password" icon="lock" accessibilityLabel="Confirm password" secureTextEntry autoCapitalize="none"
              value={confirm} onChangeText={setConfirm} editable={!busy} />
            {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={busy} onPress={submit} style={[authStyles.primaryButton, { marginTop: 24 }, busy && authStyles.disabled]}>
              {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={authStyles.buttonText}>Reset password</Text>}
            </Pressable>
            <AuthFooterLink text="" label="Request a new code" onPress={() => router.replace('/forgot-password' as Href)} />
          </> : null}
          <AuthFooterLink text="" label="Back to sign in" onPress={() => router.replace('/login')} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
