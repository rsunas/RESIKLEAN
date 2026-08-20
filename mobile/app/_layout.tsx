import { Stack } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <HeroUINativeProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </HeroUINativeProvider>
    </SafeAreaProvider>
  );
}
