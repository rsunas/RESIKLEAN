/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useResolvedTheme } from '@/hooks/app-preferences';

export function useTheme() {
  return Colors[useResolvedTheme()];
}
