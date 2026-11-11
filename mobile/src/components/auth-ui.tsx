import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ComponentProps, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputProps } from 'react-native';
import { MotionPressable as Pressable } from '@/components/app-motion';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '@/components/brand-mark';
import { AuthColors as C } from '@/constants/theme';

export function AuthHeader({ title, subtitle, includeTopInset = true }: { title: string; subtitle: string; includeTopInset?: boolean }) {
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  return (
    <LinearGradient colors={[C.tint, '#FFFFFF']} start={{ x: 0.5, y: 0 }} end={{ x: 0.5, y: 1 }} style={[styles.header, { paddingTop: 48 + (includeTopInset ? insets.top : 0) }]}>
      {width >= 380 && fontScale <= 1.3 ? (
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={styles.decoration}>
          <View style={styles.mediumCircle} /><View style={styles.largeCircle} /><View style={styles.smallCircle} />
        </View>
      ) : null}
      <BrandMark height={56} width={188} />
      <Text accessibilityRole="header" style={styles.title}>{title}</Text>
      <Text style={styles.subtitle}>{subtitle}</Text>
    </LinearGradient>
  );
}

type AuthFieldProps = TextInputProps & {
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  error?: string;
  helper?: string;
  locked?: boolean;
  trailing?: ReactNode;
  compact?: boolean;
  invalid?: boolean;
};

export function AuthField({ label, icon, error, helper, locked, trailing, compact, invalid, onFocus, onBlur, style, ...props }: AuthFieldProps) {
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  return (
    <View style={[authStyles.fieldGroup, compact && styles.compactGroup]}>
      <Text style={authStyles.label}>{label}</Text>
      <View style={[styles.field, { minHeight: Math.max(56, 16 * fontScale * 1.4 + 20) }, compact && styles.compactField, locked && styles.locked, focused && styles.focused, (!!error || invalid) && styles.invalid]}>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.fieldIcon}>
          <Feather name={icon} color={C.muted} size={20} />
        </View>
        <TextInput {...props} editable={locked ? false : props.editable} placeholderTextColor={C.muted}
          onFocus={(event) => { setFocused(true); onFocus?.(event); }}
          onBlur={(event) => { setFocused(false); onBlur?.(event); }}
          style={[styles.input, locked && styles.lockedText, style]} />
        {trailing}
      </View>
      {error ? <Text accessibilityRole="alert" style={authStyles.error}>{error}</Text> : helper ? <Text style={[authStyles.helper, locked && styles.verified]}>{helper}</Text> : null}
    </View>
  );
}

export function AuthFooterLink({ text, label, onPress }: { text: string; label: string; onPress: () => void }) {
  return <View style={authStyles.footerRow}><Text style={authStyles.footerText}>{text}</Text><Pressable accessibilityRole="link" onPress={onPress} style={authStyles.linkTarget}><Text style={authStyles.footerLink}>{label}</Text></Pressable></View>;
}

export const authStyles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#FFFFFF' },
  keyboard: { flex: 1 },
  scroll: { flex: 1, minHeight: 0 },
  scrollContent: { flexGrow: 1, paddingBottom: 24 },
  body: { paddingHorizontal: 24 },
  fieldGroup: { marginTop: 20 },
  label: { color: C.label, fontSize: 14, fontWeight: '600', marginBottom: 8 },
  helper: { color: C.muted, fontSize: 12, marginTop: 6 },
  error: { color: C.error, fontSize: 12, marginTop: 6 },
  footer: { backgroundColor: '#FFFFFF', paddingHorizontal: 24, paddingTop: 12, flexShrink: 0 },
  footerRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 6, marginTop: 8 },
  footerText: { color: C.muted, fontSize: 15, textAlign: 'center' },
  footerLink: { color: C.darkGreen, fontSize: 15, fontWeight: '700' },
  linkTarget: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  primaryButton: { minHeight: 56, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 18, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center' },
  buttonContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  buttonText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  disabled: { opacity: 0.65 },
  eye: { width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
});

const styles = StyleSheet.create({
  // Sign In opts in; Sign Up keeps its existing spacing and field treatment.
  compactGroup: { marginTop: 0 },
  compactField: { paddingRight: 4 },
  header: { paddingHorizontal: 24, paddingBottom: 20, overflow: 'hidden' },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.64, lineHeight: 37, color: C.ink, marginTop: 32 },
  subtitle: { fontSize: 16, color: C.muted, lineHeight: 23, marginTop: 8 },
  // Restrict decoration to the empty corner above the title and right of the logo.
  decoration: { position: 'absolute', top: 0, right: 0, width: 140, height: 136, overflow: 'hidden' },
  largeCircle: { position: 'absolute', width: 220, height: 220, borderRadius: 110, top: -110, right: -110, backgroundColor: '#CFEADB' },
  mediumCircle: { position: 'absolute', width: 44, height: 44, borderRadius: 22, top: 24, right: 80, backgroundColor: '#D9F0E4' },
  smallCircle: { position: 'absolute', width: 28, height: 28, borderRadius: 14, top: 108, right: 14, backgroundColor: '#C8E7D6' },
  field: { borderRadius: 16, borderWidth: 2, borderColor: 'transparent', backgroundColor: C.field, flexDirection: 'row', alignItems: 'center', paddingLeft: 16, paddingRight: 8 },
  fieldIcon: { width: 20, marginRight: 14, flexShrink: 0 },
  input: { flex: 1, minWidth: 0, color: C.ink, fontSize: 16, paddingVertical: 12, paddingHorizontal: 0 },
  locked: { backgroundColor: C.locked },
  lockedText: { color: C.label },
  focused: { borderColor: C.primary, backgroundColor: '#FFFFFF' },
  invalid: { borderColor: C.error },
  verified: { color: C.darkGreen },
});
