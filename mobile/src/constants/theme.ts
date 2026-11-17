/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#000000',
    background: '#ffffff',
    surface: '#ffffff',
    border: '#E3EAE6',
    primary: '#0A7F4F',
    textMuted: '#5A6761',
    categoryBiodegradable: '#0A7F4F',
    categoryNonBio: '#1A56C4',
    categoryRecyclable: '#B45309',
    categoryHazardous: '#B3261E',
    backgroundElement: '#F0F0F3',
    backgroundSelected: '#E0E1E6',
    textSecondary: '#60646C',
  },
  dark: {
    text: '#ffffff',
    background: '#101815',
    surface: '#1A2420',
    border: '#34443C',
    primary: '#55C58C',
    textMuted: '#AAB9B1',
    categoryBiodegradable: '#55C58C',
    categoryNonBio: '#79A8FF',
    categoryRecyclable: '#E5A146',
    categoryHazardous: '#F17A75',
    backgroundElement: '#202C26',
    backgroundSelected: '#35463D',
    textSecondary: '#B0B4BA',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    sans: 'Roboto-Regular',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'Roboto-Regular',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;

export const AuthColors = {
  primary: '#0A7F4F', tint: '#E3F4EB', darkGreen: '#086B42',
  ink: '#121A16', muted: '#5A6761', label: '#35463F',
  field: '#F1F5F3', locked: '#E8EDEA', track: '#DCE4DF',
  border: '#D5DDD9', error: '#B3261E',
} as const;
