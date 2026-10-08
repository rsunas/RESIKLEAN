import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle as SvgCircle, Path } from 'react-native-svg';
import { BarangayPicker } from '@/components/barangay-picker';
import { BrandMark } from '@/components/brand-mark';
import { saveSession, type AccountUser } from '@/lib/session';

function BadgeCheckIcon({ color = '#176b3a', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg fill="none" height={size} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24" width={size}>
      <Path d="M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z" />
      <Path d="m9 12 2 2 4-4" />
    </Svg>
  );
}

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
  const router = useRouter();
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

      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      });
      const result = (await response.json()) as RegisterResponse;

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
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/me`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${googleToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          password: password.trim(),
          location,
          barangay: location,
        }),
      });
      const result = (await response.json()) as RegisterResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.errors?.[0]?.msg || 'Unable to finish your profile.');
      }

      const user = result.data?.user || { name, email, phone, location, barangay: location, role: 'resident' as const };
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

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar backgroundColor="#eaf6f3" barStyle="dark-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.phoneFrame}>
            <View style={styles.innerCanvas}>
              <View style={styles.brandArea}>
                <View style={styles.logoRow}>
                  <BrandMark height={104} width={190} />
                </View>
              </View>

              <View style={styles.formCard}>
                <Text style={styles.headline}>Create your account</Text>
                <Text style={styles.subtext}>Join ResiKlean and track your collection schedule</Text>

                <View style={styles.progressRow}>
                  <View style={styles.progressStep}>
                    <View style={[styles.progressCircle, step >= 1 && styles.progressCircleActive]}>
                      <Text style={[styles.progressNumber, step >= 1 && styles.progressNumberActive]}>1</Text>
                    </View>
                    <Text style={[styles.progressLabel, step === 1 && styles.progressLabelActive]}>Google account</Text>
                  </View>
                  <View style={[styles.progressLine, step === 2 && styles.progressLineActive]} />
                  <View style={styles.progressStep}>
                    <View style={[styles.progressCircle, step === 2 && styles.progressCircleActive]}>
                      <Text style={[styles.progressNumber, step === 2 && styles.progressNumberActive]}>2</Text>
                    </View>
                    <Text style={[styles.progressLabel, step === 2 && styles.progressLabelActive]}>Your details</Text>
                  </View>
                </View>

                {step === 1 ? (
                  <View>
                    <View style={styles.stepIntro}>
                      <Text style={styles.stepTitle}>Verify your email</Text>
                      <Text style={styles.stepDescription}>Use your Google account to create a secure ResiKlean login.</Text>
                    </View>

                    <Pressable
                      accessibilityRole="button"
                      disabled={isGoogleSubmitting}
                      onPress={handleGoogleSignup}
                      style={[styles.googleButton, isGoogleSubmitting && styles.buttonDisabled]}>
                      {isGoogleSubmitting ? (
                        <ActivityIndicator color="#173322" />
                      ) : (
                        <View style={styles.buttonContent}>
                          <GoogleLogo />
                          <Text style={styles.googleButtonText}>Continue with Google</Text>
                        </View>
                      )}
                    </Pressable>
                  </View>
                ) : (
                  <View>
                    <View style={styles.stepHeaderRow}>
                      <View>
                        <Text style={styles.stepTitle}>Finish your profile</Text>
                        <Text style={styles.stepDescription}>Add the details needed for your collection account.</Text>
                      </View>
                      <Pressable accessibilityRole="button" onPress={returnToFirstStep} style={styles.backButton}>
                        <Feather color="#176b3a" name="arrow-left" size={16} />
                        <Text style={styles.backButtonText}>Back</Text>
                      </Pressable>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Full Name</Text>
                      <View style={styles.inputRow}>
                        <Feather color="#83938a" name="user" size={19} />
                        <TextInput
                          accessibilityLabel="Full Name"
                          autoComplete="name"
                          onChangeText={setName}
                          placeholder="Maria Santos"
                          placeholderTextColor="#8c9b93"
                          style={styles.input}
                          value={name}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Email Address</Text>
                      <View style={[styles.inputRow, styles.readOnlyInput]}>
                        <Feather color="#83938a" name="mail" size={19} />
                        <Text style={styles.readOnlyText}>{email}</Text>
                        <BadgeCheckIcon />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Phone Number</Text>
                      <View style={styles.inputRow}>
                        <Feather color="#83938a" name="phone" size={19} />
                        <TextInput
                          accessibilityLabel="Phone Number"
                          autoComplete="tel"
                          keyboardType="phone-pad"
                          onChangeText={setPhone}
                          placeholder="+63 9XX XXX XXXX"
                          placeholderTextColor="#8c9b93"
                          style={styles.input}
                          value={phone}
                        />
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Password</Text>
                      <View style={styles.inputRow}>
                        <Feather color="#83938a" name="lock" size={19} />
                        <TextInput
                          accessibilityLabel="Password"
                          autoComplete="password-new"
                          onChangeText={setPassword}
                          placeholder="Set a password (min. 6 chars)"
                          placeholderTextColor="#8c9b93"
                          secureTextEntry={!showPassword}
                          style={styles.input}
                          value={password}
                        />
                        <Pressable onPress={() => setShowPassword((v) => !v)}>
                          <Feather color="#83938a" name={showPassword ? 'eye-off' : 'eye'} size={19} />
                        </Pressable>
                      </View>
                    </View>

                    <View style={styles.fieldGroup}>
                      <Text style={styles.label}>Collection Location</Text>
                      <BarangayPicker onChange={setLocation} value={location} />
                    </View>

                    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

                    <Pressable
                      accessibilityRole="button"
                      disabled={isSubmitting}
                      onPress={handleSignup}
                      style={[styles.button, isSubmitting && styles.buttonDisabled]}>
                      {isSubmitting ? (
                        <ActivityIndicator color="#ffffff" />
                      ) : (
                        <View style={styles.buttonContent}>
                          <Text style={styles.buttonText}>Finish sign up</Text>
                          <Feather color="#ffffff" name="arrow-right" size={20} />
                        </View>
                      )}
                    </Pressable>
                  </View>
                )}

                {step === 1 && error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              </View>

              <View style={styles.footer}>
                <Text style={styles.footerText}>Already have an account? </Text>
                <Pressable accessibilityRole="link" onPress={() => router.replace('/login')}>
                  <Text style={styles.footerLink}>Sign In</Text>
                </Pressable>
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f4f8f5' },
  keyboardView: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingVertical: 16 },
  phoneFrame: { alignSelf: 'center', maxWidth: 420, width: '100%' },
  innerCanvas: {},
  brandArea: { paddingHorizontal: 24, paddingTop: 26 },
  logoRow: { alignItems: 'flex-start', flexDirection: 'row' },
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 24,
    marginHorizontal: 12,
    marginTop: 22,
    padding: 24,
    shadowColor: '#173322',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.09,
    shadowRadius: 18,
  },
  headline: { color: '#11271a', fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  subtext: { color: '#5c7566', fontSize: 14, lineHeight: 20, marginTop: 6 },
  progressRow: { alignItems: 'flex-start', flexDirection: 'row', marginTop: 25 },
  progressStep: { alignItems: 'center', width: 94 },
  progressCircle: { alignItems: 'center', backgroundColor: '#edf3ef', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  progressCircleActive: { backgroundColor: '#176b3a' },
  progressNumber: { color: '#71857a', fontSize: 14, fontWeight: '800' },
  progressNumberActive: { color: '#ffffff' },
  progressLabel: { color: '#71857a', fontSize: 10, fontWeight: '700', marginTop: 6, textAlign: 'center' },
  progressLabelActive: { color: '#176b3a' },
  progressLine: { backgroundColor: '#dce7df', flex: 1, height: 2, marginTop: 17 },
  progressLineActive: { backgroundColor: '#176b3a' },
  stepIntro: { marginTop: 27 },
  stepHeaderRow: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginTop: 27 },
  stepTitle: { color: '#173322', fontSize: 18, fontWeight: '800' },
  stepDescription: { color: '#6d8275', fontSize: 13, lineHeight: 19, marginTop: 5, maxWidth: 250 },
  googleButton: { alignItems: 'center', borderColor: '#cbdacf', borderRadius: 14, borderWidth: 1, height: 52, justifyContent: 'center', marginTop: 22 },
  googleButtonText: { color: '#173322', fontSize: 15, fontWeight: '800' },
  secondaryButton: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginTop: 17 },
  secondaryButtonText: { color: '#176b3a', fontSize: 14, fontWeight: '800', marginRight: 8 },
  backButton: { alignItems: 'center', flexDirection: 'row', marginTop: 2 },
  backButtonText: { color: '#176b3a', fontSize: 12, fontWeight: '800', marginLeft: 4 },
  fieldGroup: { marginTop: 18 },
  fieldGroupCompact: { marginTop: 20 },
  label: { color: '#203c2a', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  inputRow: { alignItems: 'center', backgroundColor: '#ffffff', borderColor: '#cfddd3', borderRadius: 14, borderWidth: 1, flexDirection: 'row', height: 53, paddingHorizontal: 14 },
  input: { color: '#173322', flex: 1, fontSize: 15, height: '100%', marginLeft: 11, paddingVertical: 0 },
  readOnlyInput: { backgroundColor: '#f4f8f5' },
  readOnlyText: { color: '#61766a', flex: 1, fontSize: 15, marginLeft: 11 },
  passwordDivider: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 23 },
  dividerLine: { backgroundColor: '#d7e2da', flex: 1, height: 1 },
  dividerText: { color: '#8a9d90', fontSize: 12, fontWeight: '700' },
  infoNote: { alignItems: 'center', backgroundColor: '#eef8f1', borderRadius: 12, flexDirection: 'row', marginTop: 18, paddingHorizontal: 12, paddingVertical: 11 },
  infoNoteText: { color: '#4e705b', flex: 1, fontSize: 12, lineHeight: 17, marginLeft: 8 },
  error: { color: '#b42318', fontSize: 13, lineHeight: 18, marginTop: 14 },
  button: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 14, height: 52, justifyContent: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.65 },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 27, marginTop: 23 },
  footerText: { color: '#597062', fontSize: 13 },
  footerLink: { color: '#176b3a', fontSize: 13, fontWeight: '800' },
});
