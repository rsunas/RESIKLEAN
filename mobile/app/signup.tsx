import { Feather, MaterialCommunityIcons } from 'expo/node_modules/@expo/vector-icons';
import { useState } from 'react';
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

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function SignupScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSignup = async () => {
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    if (!API_URL) {
      setError('EXPO_PUBLIC_API_URL is not configured.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email,
          password,
          phone,
          // Required by the current backend validator; resident is the only role this screen creates.
          role: 'resident',
        }),
      });
      const result = (await response.json()) as RegisterResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || result.errors?.[0]?.msg || 'Unable to create your account.');
      }

      if (result.data?.token && result.data.user?.role === 'resident') {
        await saveSession({ token: result.data.token, user: result.data.user });
        router.replace('/resident');
        return;
      }

      router.replace('/login');
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to create your account.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardView}>
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.phoneFrame}>
            <View style={styles.innerCanvas}>
              <View style={styles.brandArea}>
                <View style={styles.logoRow}>
                  <View style={styles.logoIcon}>
                    <MaterialCommunityIcons color="#ffffff" name="recycle" size={22} />
                  </View>
                  <Text style={styles.wordmark}>ResiKlean</Text>
                </View>
              </View>

              <View style={styles.formCard}>
                <Text style={styles.headline}>Create your account</Text>
                <Text style={styles.subtext}>Join ResiKlean and track your collection schedule</Text>

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
                  <View style={styles.inputRow}>
                    <Feather color="#83938a" name="mail" size={19} />
                    <TextInput
                      accessibilityLabel="Email Address"
                      autoCapitalize="none"
                      autoComplete="email"
                      keyboardType="email-address"
                      onChangeText={setEmail}
                      placeholder="you@example.com"
                      placeholderTextColor="#8c9b93"
                      style={styles.input}
                      value={email}
                    />
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

                <View style={styles.passwordDivider}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>Password</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Password</Text>
                  <View style={styles.inputRow}>
                    <Feather color="#83938a" name="lock" size={19} />
                    <TextInput
                      accessibilityLabel="Password"
                      autoComplete="new-password"
                      onChangeText={setPassword}
                      placeholder="At least 6 characters"
                      placeholderTextColor="#8c9b93"
                      secureTextEntry={!isPasswordVisible}
                      style={styles.input}
                      value={password}
                    />
                    <Pressable
                      accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'}
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setIsPasswordVisible((visible) => !visible)}>
                      <Feather color="#8ca197" name={isPasswordVisible ? 'eye-off' : 'eye'} size={19} />
                    </Pressable>
                  </View>
                  <Text style={styles.helperText}>At least 6 characters</Text>
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.label}>Confirm Password</Text>
                  <View style={styles.inputRow}>
                    <Feather color="#83938a" name="lock" size={19} />
                    <TextInput
                      accessibilityLabel="Confirm Password"
                      autoComplete="new-password"
                      onChangeText={setConfirmPassword}
                      placeholder="Repeat your password"
                      placeholderTextColor="#8c9b93"
                      secureTextEntry={!isConfirmPasswordVisible}
                      style={styles.input}
                      value={confirmPassword}
                    />
                    <Pressable
                      accessibilityLabel={isConfirmPasswordVisible ? 'Hide confirm password' : 'Show confirm password'}
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setIsConfirmPasswordVisible((visible) => !visible)}>
                      <Feather color="#8ca197" name={isConfirmPasswordVisible ? 'eye-off' : 'eye'} size={19} />
                    </Pressable>
                  </View>
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
                      <Text style={styles.buttonText}>Sign Up</Text>
                      <Feather color="#ffffff" name="arrow-right" size={20} />
                    </View>
                  )}
                </Pressable>
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
  phoneFrame: {
    alignSelf: 'center',
    maxWidth: 420,
    width: '100%',
  },
  innerCanvas: {},
  brandArea: { paddingHorizontal: 24, paddingTop: 26 },
  logoRow: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  logoIcon: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 20, height: 39, justifyContent: 'center', width: 39 },
  wordmark: { color: '#0f5f32', fontSize: 23, fontWeight: '800', letterSpacing: -0.5 },
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
  fieldGroup: { marginTop: 18 },
  label: { color: '#203c2a', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  inputRow: {
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderColor: '#cfddd3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 53,
    paddingHorizontal: 14,
  },
  input: { color: '#173322', flex: 1, fontSize: 15, height: '100%', marginLeft: 11, paddingVertical: 0 },
  passwordDivider: { alignItems: 'center', flexDirection: 'row', gap: 10, marginTop: 23 },
  dividerLine: { backgroundColor: '#d7e2da', flex: 1, height: 1 },
  dividerText: { color: '#8a9d90', fontSize: 12, fontWeight: '700' },
  helperText: { color: '#7b8d82', fontSize: 12, marginTop: 6 },
  error: { color: '#b42318', fontSize: 13, lineHeight: 18, marginTop: 14 },
  button: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 14, height: 52, justifyContent: 'center', marginTop: 20 },
  buttonDisabled: { opacity: 0.65 },
  buttonContent: { alignItems: 'center', flexDirection: 'row', gap: 9 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '800' },
  footer: { alignItems: 'center', flexDirection: 'row', justifyContent: 'center', marginBottom: 27, marginTop: 23 },
  footerText: { color: '#597062', fontSize: 13 },
  footerLink: { color: '#176b3a', fontSize: 13, fontWeight: '800' },
});
