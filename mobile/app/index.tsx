import { Redirect } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getSession, type AuthSession } from '@/lib/session';

export default function Index() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getSession()
      .then((savedSession) => setSession(savedSession))
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color="#07815f" size="large" />
      </View>
    );
  }

  const role = session?.user.role;
  if (role === 'resident' || role === 'collector' || role === 'staff') {
    return <Redirect href={`/${role}` as '/resident' | '/collector' | '/staff'} />;
  }

  return <Redirect href="/login" />;
}

const styles = StyleSheet.create({
  loading: {
    alignItems: 'center',
    backgroundColor: '#f5fbf8',
    flex: 1,
    justifyContent: 'center',
  },
});
