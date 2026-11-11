import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Keyboard,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { useRouter } from 'expo-router';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthField, AuthFooterLink, authStyles } from '@/components/auth-ui';
import { BrandMark } from '@/components/brand-mark';
import { AuthColors as C } from '@/constants/theme';
import { saveSession, type AccountUser } from '@/lib/session';

type Role = 'resident' | 'collector' | 'staff';

type LoginResponse = {
  success: boolean;
  data?: {
    token?: string;
    user?: AccountUser;
  };
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;
export default function LoginScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const formOffset = useRef(new Animated.Value(0)).current;

  // Keep the current field in view on compact Android screens without making
  // the screen manually scrollable. It returns to the original layout on hide.
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (event) => {
      const keyboardHeight = event.endCoordinates.height || 250;
      const lift = Math.min(190, Math.max(128, keyboardHeight * 0.6));
      Animated.timing(formOffset, {
        toValue: -lift,
        duration: 180,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      Animated.timing(formOffset, {
        toValue: 0,
        duration: 160,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
    return () => { show.remove(); hide.remove(); };
  }, [formOffset]);

  const handleLogin = async () => {
    if (!API_URL) {
      setError('EXPO_PUBLIC_API_URL is not configured.');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json()) as LoginResponse;
      const role = result.data?.user?.role as Role | undefined;

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Unable to sign in.');
      }

      if (!role || !['resident', 'collector', 'staff'].includes(role)) {
        throw new Error('This account does not have mobile access.');
      }

      if (!result.data?.token || !result.data.user) {
        throw new Error('Your sign-in session could not be created.');
      }

      await saveSession({ token: result.data.token, user: result.data.user });

      router.replace(`/${role}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={authStyles.page}>
      <StatusBar backgroundColor="transparent" barStyle="dark-content" />
      <ScrollView testID="login-scroll" style={authStyles.scroll} scrollEnabled={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" automaticallyAdjustContentInsets={false}>
        <Animated.View style={[styles.keyboardLift, { transform: [{ translateY: formOffset }] }]}>
          <View testID="login-illustration" style={styles.banner}>
            <Image source={require('@/assets/images/swmo-login-800.webp')} contentFit="cover"
              contentPosition={{ left: '14%', top: '50%' }} accessible={false}
              accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill} />
            <LinearGradient colors={['transparent', 'transparent', 'rgba(13,46,39,0.55)']}
              locations={[0, 0.55, 1]} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }}
              pointerEvents="none" style={StyleSheet.absoluteFill} />
            <View style={[styles.chip, { top: insets.top + 20 }]}>
              <Text style={styles.chipText}>SWMO · Naga City</Text>
            </View>
          </View>
          <View style={styles.sheet}>
            <BrandMark height={40} width={132} />
            <Text accessibilityRole="header" style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>Sign in to your ResiKlean account</Text>
            <View style={styles.fields}>
              <AuthField compact invalid={!!error} label="Email address" icon="mail" accessibilityLabel="Email Address"
                autoCapitalize="none" autoComplete="email" keyboardType="email-address"
                onChangeText={setEmail} placeholder="you@example.com" value={email} />
              <AuthField compact invalid={!!error} label="Password" icon="lock" accessibilityLabel="Password"
                autoComplete="current-password" onChangeText={setPassword} placeholder="Enter your password"
                secureTextEntry={!isPasswordVisible} value={password}
                trailing={<Pressable accessibilityLabel={isPasswordVisible ? 'Hide password' : 'Show password'} accessibilityRole="button"
                  onPress={() => setIsPasswordVisible((visible) => !visible)} style={authStyles.eye}>
                  <Feather color={C.muted} name={isPasswordVisible ? 'eye-off' : 'eye'} size={20} />
                </Pressable>} />
            </View>
            {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : null}
            {/* Existing screen has no reset-password handler or route. Preserve that behavior. */}
            <Text style={styles.forgotPassword}>Forgot password?</Text>
            <View testID="login-footer" style={[authStyles.footer, styles.footer, { paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              <Pressable accessibilityRole="button" disabled={isSubmitting} onPress={handleLogin}
                style={[authStyles.primaryButton, isSubmitting && authStyles.disabled]}>
                {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <View style={authStyles.buttonContent}>
                  <Text style={authStyles.buttonText}>Sign In</Text><Feather color="#ffffff" name="arrow-right" size={20} />
                </View>}
              </Pressable>
              <AuthFooterLink text="Don't have an account?" label="Sign Up" onPress={() => router.push('/signup')} />
            </View>
          </View>
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  keyboardLift: { flexGrow: 1 },
  banner: { height: 260, overflow: 'hidden', backgroundColor: '#CFE8DC' },
  chip: { position: 'absolute', left: 24, maxWidth: '85%', borderRadius: 999, borderWidth: 1, borderColor: 'rgba(255,255,255,0.35)', backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 14, paddingVertical: 8 },
  chipText: { color: '#FFFFFF', fontSize: 12, fontWeight: '600', textAlign: 'center' },
  sheet: { marginTop: -28, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 22, paddingHorizontal: 24, backgroundColor: '#FFFFFF', flexGrow: 1 },
  title: { color: C.ink, fontSize: 28, fontWeight: '700', letterSpacing: -0.56, marginTop: 16 },
  subtitle: { color: C.muted, fontSize: 15, marginTop: 4 },
  fields: { marginTop: 18, gap: 12 },
  footer: { paddingHorizontal: 0, paddingTop: 4 },
  forgotPassword: { alignSelf: 'flex-end', color: C.darkGreen, fontSize: 14, fontWeight: '600', minHeight: 44, paddingVertical: 10, marginTop: 2, textAlign: 'right' },
});
