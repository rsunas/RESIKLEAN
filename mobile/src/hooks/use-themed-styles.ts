import { useCallback, useMemo } from 'react';
import { StyleSheet, type ImageStyle, type TextStyle, type ViewStyle } from 'react-native';
import { useAppTheme } from '@/hooks/app-preferences';

type NativeStyle = ViewStyle | TextStyle | ImageStyle;

/** Apply explicit surface/foreground overrides together, without guessing from text colors. */
export function useThemedStyles<T extends Record<string, NativeStyle>>(
  light: T,
  dark: Partial<Record<keyof T, NativeStyle>>,
  forceLight = false,
): T {
  const theme = useAppTheme();
  return useMemo(() => {
    if (forceLight || theme === 'light') return light;
    return Object.fromEntries(Object.entries(light).map(([key, style]) => [
      key, StyleSheet.flatten([style, dark[key]]),
    ])) as unknown as T;
  }, [light, dark, theme, forceLight]);
}

/** Explicit theme pair for inline icons, placeholders and data-driven colors. */
export function useThemeColor(forceLight = false) {
  const theme = useAppTheme();
  return useCallback((light: string, dark: string) => !forceLight && theme === 'dark' ? dark : light, [theme, forceLight]);
}
