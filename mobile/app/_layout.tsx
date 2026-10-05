import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
  useFonts,
} from '@expo-google-fonts/roboto';
import { Stack } from 'expo-router';
import { useRouter } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect } from 'react';
import '@/lib/notifications';
import '@/lib/driver-geofencing';
import '@/lib/driver-route-proximity';

const appFont = 'Roboto-Regular';
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
    'Roboto-Regular': Roboto_400Regular,
    'Roboto-Medium': Roboto_500Medium,
    'Roboto-Bold': Roboto_700Bold,
    'Roboto-Black': Roboto_900Black,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <HeroUINativeProvider>
          <NotificationObserver />
          <Stack screenOptions={{ headerShown: false }} />
        </HeroUINativeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
