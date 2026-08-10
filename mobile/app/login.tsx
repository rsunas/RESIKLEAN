import { useState } from 'react';
import { ActivityIndicator, Pressable, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';

type Role = 'resident' | 'collector' | 'staff';

type LoginResponse = {
  success: boolean;
  data?: {
    token?: string;
    user?: {
      role?: string;
    };
  };
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL;

export default function LoginScreen() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

      router.replace(`/${role}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to sign in.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>
        <Text style={styles.title}>ResiKlean</Text>
        <Text style={styles.subtitle}>Sign in to continue</Text>

        <TextInput
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          onChangeText={setEmail}
          placeholder="Email address"
          style={styles.input}
          value={email}
        />
        <TextInput
          autoComplete="password"
          onChangeText={setPassword}
          placeholder="Password"
          secureTextEntry
          style={styles.input}
          value={password}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          accessibilityRole="button"
          disabled={isSubmitting}
          onPress={handleLogin}
          style={[styles.button, isSubmitting && styles.buttonDisabled]}>
          {isSubmitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>Sign in</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f6faf7' },
  content: { flex: 1, justifyContent: 'center', padding: 24, gap: 14 },
  title: { color: '#176b3a', fontSize: 32, fontWeight: '700' },
  subtitle: { color: '#4b6353', fontSize: 16, marginBottom: 18 },
  input: { backgroundColor: '#ffffff', borderColor: '#cdd9d0', borderRadius: 10, borderWidth: 1, fontSize: 16, padding: 14 },
  error: { color: '#b42318', marginTop: 4 },
  button: { alignItems: 'center', backgroundColor: '#176b3a', borderRadius: 10, marginTop: 10, minHeight: 50, justifyContent: 'center' },
  buttonDisabled: { opacity: 0.65 },
  buttonText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
});
