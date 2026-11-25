import { SignupPrivacy, PRIVACY_REQUIRED_MESSAGE } from '@/components/signup-privacy';
import { requestJson } from '@/lib/network-request';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { BarangayPicker } from '@/components/barangay-picker';
import { AuthField, AuthFooterLink, AuthHeader, authStyles } from '@/components/auth-ui';
import { SignupProgress } from '@/components/signup-progress';
import { MotionPressable as Pressable, SignupStepTransition } from '@/components/app-motion';
import { AuthColors as C } from '@/constants/theme';
import { saveSession, type AccountUser } from '@/lib/session';


type RegisterResponse = {
  success: boolean;
  data?: {
    token?: string;
    user?: AccountUser;
  };
  error?: string;
  errors?: Array<{ msg?: string }>;
};

type SignupStep = 1 | 2;

const API_URL = process.env.EXPO_PUBLIC_API_URL;
const GOOGLE_WEB_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID?.trim();

function GoogleLogo() {
  return (
    <Svg height={26} viewBox="0 0 24 24" width={26}>
      <Path d="M21.35 12.27c0-.79-.07-1.54-.23-2.27H12v4.3h5.22a4.46 4.46 0 0 1-1.94 2.92v2.43h3.14c1.84-1.7 2.93-4.2 2.93-7.38z" fill="#4285F4" />
      <Path d="M12 21.5c2.63 0 4.84-.87 6.45-2.35l-3.14-2.43c-.87.58-1.98.92-3.31.92-2.54 0-4.7-1.72-5.47-4.03H3.28v2.5A9.74 9.74 0 0 0 12 21.5z" fill="#34A853" />
      <Path d="M6.53 13.61A5.85 5.85 0 0 1 6.23 12c0-.56.1-1.1.3-1.61v-2.5H3.28A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.03 4.39l3.25-2.78z" fill="#FBBC05" />
      <Path d="M12 6.36c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.43 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.72 5.39l3.25 2.5C7.3 8.08 9.46 6.36 12 6.36z" fill="#EA4335" />
    </Svg>
  );
}

export default function SignupScreen() {
  const formScroll = useRef<ScrollView>(null);
  const formBodyY = useRef(0);
  const locationY = useRef(0);
  const stepY = useRef(0);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (focusTimer.current) clearTimeout(focusTimer.current); }, []);
  const revealLocations = () => {
    if (focusTimer.current) clearTimeout(focusTimer.current);
    focusTimer.current = setTimeout(() => formScroll.current?.scrollTo({ y: Math.max(0, formBodyY.current + stepY.current + locationY.current - 12), animated: true }), 250);
  };
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [step, setStep] = useState<SignupStep>(1);
  const [googleToken, setGoogleToken] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [location, setLocation] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);

  useEffect(() => {
    if (GOOGLE_WEB_CLIENT_ID) {
      GoogleSignin.configure({ webClientId: GOOGLE_WEB_CLIENT_ID });
    }
  }, []);

  const handleGoogleSignup = async () => {
    if (!privacyAccepted) { setError(PRIVACY_REQUIRED_MESSAGE); return; }
    if (isSubmitting || isGoogleSubmitting) return;
    if (!API_URL) {
      setError('EXPO_PUBLIC_API_URL is not configured.');
      return;
    }

    if (!GOOGLE_WEB_CLIENT_ID) {
      setError('Google sign-in is not configured for this build.');
      return;
    }

    setError('');
    setIsGoogleSubmitting(true);
    try {
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      try { await GoogleSignin.signOut(); } catch { /* ignore if not signed in */ }
      const signInResponse = await GoogleSignin.signIn();

      if (!isSuccessResponse(signInResponse)) {
        setIsGoogleSubmitting(false);
        return;
      }

      const idToken = signInResponse.data.idToken;
      if (!idToken || !API_URL) {
        throw new Error(idToken ? 'EXPO_PUBLIC_API_URL is not configured.' : 'Google did not return an ID token.');
      }

      const { response, payload: result } = await requestJson<RegisterResponse>(`${API_URL.replace(/\/$/, '')}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, intent: 'signup' }),
      });

      if (!response.ok || !result.success || !result.data?.token || !result.data.user) {
        throw new Error(result.error || result.errors?.[0]?.msg || 'Unable to connect your Google account.');
      }

      setGoogleToken(result.data.token);
      setEmail(result.data.user.email || signInResponse.data.user.email || '');
      setName(result.data.user.name || signInResponse.data.user.name || '');
      setStep(2);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to open Google sign-in.');
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  const handleSignup = async () => {
    if (!privacyAccepted) { setError(PRIVACY_REQUIRED_MESSAGE); return; }
    if (isSubmitting || isGoogleSubmitting) return;
    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!password.trim() || password.trim().length < 6) {
      setError('Please set a password with at least 6 characters.');
      return;
    }

    if (!location) {
      setError('Please select your collection location.');
      return;
    }

    if (!API_URL) {
      setError('EXPO_PUBLIC_API_URL is not configured.');
      return;
    }

    if (!googleToken) {
      setError('Connect your Google account before continuing.');
      setStep(1);
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      // Google has already authenticated this account. Set its password through
      // the password endpoint before saving the remaining profile fields.
      const { response: passwordResponse, payload: passwordResult } = await requestJson<RegisterResponse>(`${API_URL.replace(/\/$/, '')}/auth/change-password`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ newPassword: password.trim() }),
      });
      if (!passwordResponse.ok || !passwordResult.success) {
        throw new Error(passwordResult.error || passwordResult.errors?.[0]?.msg || 'Unable to set your password. Please try again.');
      }

      const { response, payload: result } = await requestJson<RegisterResponse>(`${API_URL.replace(/\/$/, '')}/auth/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          location,
          barangay: location,
        }),
      });

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.errors?.[0]?.msg || 'Unable to finish your profile.');
      }

      const user = (result.data?.user || result.data || { name, email, phone, location, barangay: location, role: 'resident' as const }) as AccountUser;
      await saveSession({ token: googleToken, user });
      router.replace('/resident');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to finish your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const returnToFirstStep = () => {
    setStep(1);
    setError('');
  };

  // Match only existing validation messages; do not invent field validation.
  const nameError = error === 'Please enter your full name.' ? error : '';
  const passwordError = error === 'Please set a password with at least 6 characters.' ? error : '';
  const locationError = error === 'Please select your collection location.' ? error : '';
  const generalError = !nameError && !passwordError && !locationError ? error : '';

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={authStyles.page}>
      <StatusBar backgroundColor={C.tint} barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={authStyles.keyboard}>
        <ScrollView ref={formScroll} testID="signup-scroll" style={authStyles.scroll} contentContainerStyle={authStyles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <AuthHeader includeTopInset={false} title="Create your account" subtitle="Join ResiKlean and track your collection schedule" />
          <View onLayout={event => { formBodyY.current = event.nativeEvent.layout.y; }} style={authStyles.body}>
            <SignupProgress step={step} />
            <View onLayout={event => { stepY.current = event.nativeEvent.layout.y; }}><SignupStepTransition step={step}>
            {step === 1 ? (
              <View>
                <View style={styles.stepIntro}>
                  <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.mailBadge}>
                    <Feather name="mail" size={24} color={C.primary} />
                  </View>
                  <Text style={styles.stepTitle}>Verify your email</Text>
                  <Text style={styles.stepDescription}>Use your Google account to create a secure ResiKlean login.</Text>
                </View>
                <SignupPrivacy accepted={privacyAccepted} disabled={isSubmitting || isGoogleSubmitting} onChange={(accepted) => { setPrivacyAccepted(accepted); if (accepted && error === PRIVACY_REQUIRED_MESSAGE) setError(''); }} />
                <Pressable accessibilityRole="button" disabled={isGoogleSubmitting || !privacyAccepted} onPress={handleGoogleSignup}
                  style={[styles.googleButton, (isGoogleSubmitting || !privacyAccepted) && authStyles.disabled]}>
                  {isGoogleSubmitting ? <ActivityIndicator color={C.ink} /> : <View style={authStyles.buttonContent}>
                    <GoogleLogo /><Text style={styles.googleButtonText}>Continue with Google</Text>
                  </View>}
                </Pressable>
              </View>
            ) : (
              <View>
                <View style={styles.stepHeaderRow}>
                  <Text style={styles.detailsTitle}>Finish your profile</Text>
                  <Pressable accessibilityRole="button" onPress={returnToFirstStep} style={styles.backButton}>
                    <Feather color={C.darkGreen} name="arrow-left" size={20} /><Text style={styles.backButtonText}>Back</Text>
                  </Pressable>
                </View>
                <Text style={styles.stepDescription}>Add the details needed for your collection account.</Text>
                <AuthField label="Full name" icon="user" accessibilityLabel="Full Name" autoComplete="name"
                  onChangeText={setName} placeholder="Maria Santos" value={name} error={nameError} />
                <AuthField label="Email address" icon="mail" accessibilityLabel="Email Address" value={email} locked helper="Verified with Google"
                  trailing={<View accessible={false} style={styles.verifiedIcon}><Feather name="check-circle" color={C.primary} size={22} /></View>} />
                <AuthField label="Phone number" icon="phone" accessibilityLabel="Phone Number" autoComplete="tel" keyboardType="phone-pad"
                  onChangeText={setPhone} placeholder="+63 9XX XXX XXXX" value={phone} />
                <AuthField label="Password" icon="lock" accessibilityLabel="Password" autoComplete="password-new"
                  onChangeText={setPassword} placeholder="Create a password" secureTextEntry={!showPassword} value={password}
                  helper="At least 6 characters" error={passwordError}
                  trailing={<Pressable accessibilityRole="button" accessibilityLabel={showPassword ? 'Hide password' : 'Show password'}
                    onPress={() => setShowPassword((v) => !v)} style={authStyles.eye}>
                    <Feather color={C.muted} name={showPassword ? 'eye-off' : 'eye'} size={20} />
                  </Pressable>} />
                <View onLayout={event => { locationY.current = event.nativeEvent.layout.y; }} style={authStyles.fieldGroup}>
                  <Text style={authStyles.label}>Collection location</Text>
                  <BarangayPicker onSearchFocus={revealLocations} appearance="auth" invalid={!!locationError} onChange={setLocation} value={location} />
                  {locationError ? <Text accessibilityRole="alert" style={authStyles.error}>{locationError}</Text> : null}
                </View>
              </View>
            )}
            </SignupStepTransition></View>
            {step === 2 && <SignupPrivacy accepted={privacyAccepted} disabled={isSubmitting || isGoogleSubmitting} onChange={(accepted) => { setPrivacyAccepted(accepted); if (accepted && error === PRIVACY_REQUIRED_MESSAGE) setError(''); }} />}
            {generalError ? <Text accessibilityRole="alert" style={authStyles.error}>{generalError}</Text> : null}
          </View>
        <View testID="signup-footer" style={[authStyles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {step === 2 ? <Pressable accessibilityRole="button" disabled={isSubmitting || !privacyAccepted} onPress={handleSignup}
            style={[authStyles.primaryButton, (isSubmitting || !privacyAccepted) && authStyles.disabled]}>
            {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <View style={authStyles.buttonContent}>
              <Text style={authStyles.buttonText}>Finish sign up</Text><Feather color="#ffffff" name="arrow-right" size={20} />
            </View>}
          </Pressable> : null}
          <AuthFooterLink text="Already have an account?" label="Sign In" onPress={() => router.replace('/login')} />
        </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  stepIntro: { marginTop: 28 },
  mailBadge: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.tint, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  stepTitle: { color: C.ink, fontSize: 20, fontWeight: '700' },
  detailsTitle: { color: C.ink, fontSize: 22, fontWeight: '700', flex: 1, minWidth: 0 },
  stepDescription: { color: C.muted, fontSize: 15, lineHeight: 22, marginTop: 8 },
  stepHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 28 },
  backButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', minHeight: 44, minWidth: 44, gap: 6 },
  backButtonText: { color: C.darkGreen, fontSize: 15, fontWeight: '600' },
  googleButton: { backgroundColor: '#FFFFFF', borderColor: C.border, borderRadius: 18, borderWidth: 1.5, minHeight: 56, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center', justifyContent: 'center', marginTop: 28 },
  googleButtonText: { color: C.ink, fontSize: 16, fontWeight: '600', flexShrink: 1, textAlign: 'center' },
  verifiedIcon: { width: 44, alignItems: 'center' },
});
