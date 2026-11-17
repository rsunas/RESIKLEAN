import '@/global.css';
import { addNotificationResponseReceivedListener, getLastNotificationResponseAsync } from 'expo-notifications/build/NotificationsEmitter';
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types';
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
  Roboto_900Black,
  useFonts,
} from '@expo-google-fonts/roboto';
import { Stack, useRootNavigationState } from 'expo-router';
import { useRouter } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { Text, TextInput, type TextInputProps, type TextProps } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useEffect, useRef } from 'react';
import { AppMotionProvider, useAppReducedMotion } from '@/hooks/use-app-reduced-motion';
import '@/lib/notifications';
import { startNetworkRecovery } from '@/lib/network-recovery';
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

function AppStack() {
  const reduced = useAppReducedMotion();
  const state = useRootNavigationState();
  const current = state?.routes[state.index ?? 0];
  const launchKey = useRef<string | null>(null);
  const hasNavigated = useRef(false);
  const animate = hasNavigated.current || Boolean(current && current.name !== 'index' && launchKey.current && current.key !== launchKey.current);
  useEffect(() => {
    // The index redirect and a cold-start deep link are both initial presentation.
    if (current && current.name !== 'index') {
      if (!launchKey.current) launchKey.current = current.key;
      else if (current.key !== launchKey.current) hasNavigated.current = true;
    }
  }, [current]);
  return <Stack screenOptions={{ headerShown: false, animation: !animate ? 'none' : reduced ? 'fade' : 'slide_from_right', animationDuration: 250 }}>
    {['login', 'signup', 'resident', 'staff', 'collector'].map((name) => <Stack.Screen key={name} name={name} options={{ animation: animate ? 'fade' : 'none', animationDuration: 250 }} />)}
  </Stack>;
}

export default function RootLayout() {
  useEffect(startNetworkRecovery, []);
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
        <AppMotionProvider>
          <HeroUINativeProvider>
            <NotificationObserver />
            <AppStack />
          </HeroUINativeProvider>
        </AppMotionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
