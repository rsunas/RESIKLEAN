import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import '@/lib/notifications';
import '@/lib/driver-geofencing';
import '@/lib/driver-route-proximity';

const appFont = 'PlusJakartaSans-Regular';
const AppText = Text as typeof Text & { defaultProps?: TextProps };
const AppTextInput = TextInput as typeof TextInput & { defaultProps?: TextInputProps };

AppText.defaultProps = {
  ...AppText.defaultProps,
  style: [{ fontFamily: appFont }, AppText.defaultProps?.style],
};

AppTextInput.defaultProps = {
  ...AppTextInput.defaultProps,
  style: [{ fontFamily: appFont }, AppTextInput.defaultProps?.style],
};

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
  const [fontsLoaded] = useFonts({
    'PlusJakartaSans-Regular': PlusJakartaSans_400Regular,
    'PlusJakartaSans-Medium': PlusJakartaSans_500Medium,
    'PlusJakartaSans-SemiBold': PlusJakartaSans_600SemiBold,
    'PlusJakartaSans-Bold': PlusJakartaSans_700Bold,
    'PlusJakartaSans-ExtraBold': PlusJakartaSans_800ExtraBold,
  });

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <HeroUINativeProvider>
        <NotificationObserver />
        <Stack screenOptions={{ headerShown: false }} />
      </HeroUINativeProvider>
    </SafeAreaProvider>
  );
}
