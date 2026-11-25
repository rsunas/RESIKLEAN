import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { useAppLanguage, useAppTheme } from '@/hooks/app-preferences';
import { darkPalette } from '@/constants/mobile-palette';
import { translate } from '@/lib/i18n';

const USER_TEXT_SCALE = 1.1;

export function AppText({ style, ...props }: TextProps) {
  const language = useAppLanguage();
  const dark = useAppTheme() === 'dark';
  const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const scaledFontSize = typeof flattenedStyle?.fontSize === 'number'
    ? flattenedStyle.fontSize * USER_TEXT_SCALE
    : undefined;

  return (
    <NativeText
      {...props}
      style={[
        { fontFamily: 'Roboto-Regular', color: dark ? darkPalette.text : '#121A16' },
        style,
        scaledFontSize ? { fontSize: scaledFontSize } : undefined,
      ]}
    >
      {typeof props.children === 'string' ? translate(props.children, language) : props.children}
    </NativeText>
  );
}
