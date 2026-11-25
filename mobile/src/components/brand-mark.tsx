import { Image } from 'react-native';
import { useAppTheme } from '@/hooks/app-preferences';

type BrandMarkProps = {
  height?: number;
  width?: number;
};

export function BrandMark({ height = 78, width = 190 }: BrandMarkProps) {
  const dark = useAppTheme() === 'dark';
  return <Image accessibilityLabel="ResiKlean logo" resizeMode="contain" source={require('@/assets/images/swmo-resiklean-logo-mobile.png')} style={{ height, width, ...(dark ? { backgroundColor: '#FFFFFF', borderRadius: 8 } : {}) }} />;
}
