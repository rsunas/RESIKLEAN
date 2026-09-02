import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import '@/lib/notifications';

function NotificationObserver() {
  const router = useRouter();

  useEffect(() => {
    const openNotificationTarget = (response: NotificationResponse) => {
      const data = response.notification.request.content.data as { screen?: string } | undefined;
      if (data?.screen === 'schedule') {
        router.push({ pathname: '/resident', params: { tab: 'schedule' } });
      }
    };

    const subscription = addNotificationResponseReceivedListener(openNotificationTarget);
    getLastNotificationResponseAsync().then((response) => {
      if (response) openNotificationTarget(response);
    });

    return () => subscription.remove();
  }, [router]);

  return null;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <HeroUINativeProvider>
        <NotificationObserver />
        <Stack screenOptions={{ headerShown: false }} />
      </HeroUINativeProvider>
    </SafeAreaProvider>
  );
}
