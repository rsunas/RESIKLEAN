import { Text as NativeText, StyleSheet, type TextProps, type TextStyle } from 'react-native';

const USER_TEXT_SCALE = 1.1;

export function AppText({ style, ...props }: TextProps) {
  const flattenedStyle = StyleSheet.flatten(style) as TextStyle | undefined;
  const scaledFontSize = typeof flattenedStyle?.fontSize === 'number'
    ? flattenedStyle.fontSize * USER_TEXT_SCALE
    : undefined;

  return (
    <NativeText
      {...props}
      style={[
        { fontFamily: 'PlusJakartaSans-Regular' },
        style,
        scaledFontSize ? { fontSize: scaledFontSize } : undefined,
      ]}
    />
  );
}
