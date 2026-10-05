import { Image } from 'react-native';

type BrandMarkProps = {
  height?: number;
  width?: number;
};

export function BrandMark({ height = 78, width = 190 }: BrandMarkProps) {
  return <Image accessibilityLabel="ResiKlean logo" resizeMode="contain" source={require('@/assets/images/swmo-resiklean-logo-mobile.png')} style={{ height, width }} />;
}
