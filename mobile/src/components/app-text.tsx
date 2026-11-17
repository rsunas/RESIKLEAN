import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from 'react-native';
import { useAppLanguage, useAppTheme } from '@/hooks/app-preferences';
import { translate } from '@/lib/i18n';

const USER_TEXT_SCALE = 1.1;

export function AppText({ style, ...props }: TextProps) {
  const language = useAppLanguage();
  const dark = useAppTheme() === 'dark';
  const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const scaledFontSize = typeof flattenedStyle?.fontSize === 'number'
    ? flattenedStyle.fontSize * USER_TEXT_SCALE
    : undefined;
  const darkTextColor = typeof flattenedStyle?.color === 'string' ? darkColor(flattenedStyle.color) : undefined;

  return (
    <NativeText
      {...props}
      style={[
        { fontFamily: 'Roboto-Regular' },
        style,
        dark && darkTextColor ? { color: darkTextColor } : undefined,
        scaledFontSize ? { fontSize: scaledFontSize } : undefined,
      ]}
    >
      {typeof props.children === 'string' ? translate(props.children, language) : props.children}
    </NativeText>
  );
}

function darkColor(color: string) {
  const known: Record<string, string> = {
    '#000000': '#F3F7F4', '#000': '#F3F7F4', '#121A16': '#F3F7F4', '#111111': '#F3F7F4',
    '#1A1A1A': '#F3F7F4', '#1B1B1B': '#F3F7F4', '#35463F': '#D3E0D9', '#314238': '#D3E0D9',
    '#5A6761': '#AAB9B1', '#60646C': '#AAB9B1', '#71837A': '#AAB9B1', '#74867D': '#AAB9B1',
    '#086B42': '#72D8A3', '#0A7F4F': '#72D8A3', '#07815F': '#72D8A3', '#087B5B': '#72D8A3',
  };
  return known[color.toUpperCase()] ?? color;
}
