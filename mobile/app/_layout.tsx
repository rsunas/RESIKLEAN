import { Stack } from 'expo-router';
import { HeroUINativeProvider } from 'heroui-native';

export default function RootLayout() {
  return (
    <HeroUINativeProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </HeroUINativeProvider>
  );
}
