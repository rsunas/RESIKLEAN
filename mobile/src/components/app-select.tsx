import { darkPalette } from '@/constants/mobile-palette';
import { useThemedStyles, useThemeColor } from '@/hooks/use-themed-styles';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useState, type ComponentProps } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, Text as NativeText, View, useWindowDimensions } from 'react-native';
import { MotionModal as Modal, MotionPressable as Pressable } from '@/components/app-motion';
import { AppText as Text } from '@/components/app-text';
import { AuthColors as C } from '@/constants/theme';

export type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type AppSelectProps = {
  appearance?: 'default' | 'staff' | 'auth' | 'staff-filter';
  searchable?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  leadingIcon?: ComponentProps<typeof Feather>['name'];
  label?: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  value: string;
};

export function AppSelect({ searchable = false, appearance = 'default', invalid = false, disabled = false, leadingIcon, label, onChange, options, placeholder = 'Select one', value }: AppSelectProps) {
  const themeColor = useThemeColor(appearance === 'auth');
  const styles = useStyles(appearance === 'auth');
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const matches = options.filter(option => !searchable || `${option.label} ${option.description || ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const [focused, setFocused] = useState(false);
  const { fontScale } = useWindowDimensions();
  const TriggerText = appearance === 'auth' || appearance === 'staff-filter' ? NativeText : Text;
  const selectedOption = options.find((option) => option.value === value);

  const selectOption = (option: AppSelectOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <View style={[styles.container, appearance === 'staff' && styles.staffContainer]}>
      {label ? <Text style={[styles.label, appearance === 'staff' && styles.staffLabel, appearance === 'staff-filter' && styles.filterLabel]}>{label}</Text> : null}

      <Pressable
        accessibilityLabel={[label, selectedOption?.label ?? placeholder].filter(Boolean).join(', ')}
        accessibilityRole="button"
        accessibilityState={{ disabled, expanded: isOpen }}
        disabled={disabled}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onPress={() => { setSearch(''); setIsOpen(true); }}
        style={({ pressed }) => [styles.trigger, appearance === 'staff' && styles.staffTrigger, pressed && styles.triggerPressed, appearance === 'auth' && styles.authTrigger, appearance === 'auth' && { minHeight: Math.max(56, 16 * fontScale * 1.4 + 20) }, appearance === 'auth' && (focused || isOpen) && styles.authFocus, appearance === 'auth' && invalid && styles.authInvalid, appearance === 'staff-filter' && styles.filterTrigger, appearance === 'staff-filter' && { minHeight: Math.max(52, 15 * fontScale * 1.4 + 24) }, disabled && styles.disabled]}>
        {leadingIcon ? (
          <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.leadingIcon, appearance === 'auth' && styles.authLeadingIcon, appearance === 'staff-filter' && styles.filterLeadingIcon]}>
            <Feather name={leadingIcon} size={20} color={appearance === 'staff-filter' ? themeColor('#5A6761', darkPalette.muted) : appearance === 'auth' ? C.muted : themeColor('#0A7F4F', darkPalette.accent)} />
          </View>
        ) : null}
        <TriggerText ellipsizeMode="tail" numberOfLines={appearance !== 'default' ? 1 : undefined} style={[styles.triggerText, !selectedOption && styles.placeholder, appearance === 'staff' && styles.staffText, appearance === 'auth' && styles.authText, appearance === 'auth' && !selectedOption && styles.authPlaceholder, appearance === 'staff-filter' && styles.filterText]}>
          {selectedOption?.label ?? placeholder}
        </TriggerText>
        <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none" style={[styles.chevron, isOpen && styles.chevronOpen]}>
          <Feather name="chevron-down" size={appearance === 'auth' ? 22 : 20} color={themeColor("#35463F", darkPalette.text)} />
        </View>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        statusBarTranslucent
        transparent
        visible={isOpen}>
        <KeyboardAvoidingView enabled={searchable} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setIsOpen(false)} style={styles.backdrop} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label ?? placeholder}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setIsOpen(false)} style={[styles.closeButton, appearance !== 'default' && styles.staffCloseButton]}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            {searchable ? <TextInput accessibilityLabel={`Search ${label ?? 'options'}`} placeholder="Search options..." placeholderTextColor={themeColor("#5A6761", darkPalette.muted)} value={search} onChangeText={setSearch} autoCorrect={false} style={styles.optionSearch}/> : null}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
              {!matches.length ? <Text style={styles.optionEmpty}>No matching options</Text> : null}
              {matches.map((option) => {
                const isSelected = option.value === value;
                return (
                  <Pressable
                    accessibilityRole="button"
                    key={option.value}
                    onPress={() => selectOption(option)}
                    style={({ pressed }) => [styles.option, isSelected && styles.selectedOption, pressed && styles.optionPressed]}>
                    <View style={styles.optionCopy}>
                      <Text style={[styles.optionLabel, isSelected && styles.selectedOptionLabel]}>{option.label}</Text>
                      {option.description ? <Text style={styles.optionDescription}>{option.description}</Text> : null}
                    </View>
                    {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  filterLabel: { color: '#35463F', fontSize: 14, fontWeight: '600', marginBottom: 8 },
  filterTrigger: { backgroundColor: '#F1F5F3', borderWidth: 0, borderRadius: 16, height: 'auto', minHeight: 52, paddingLeft: 48, paddingRight: 16, paddingVertical: 12 },
  filterLeadingIcon: { position: 'absolute', left: 16, marginRight: 0 },
  filterText: { color: '#121A16', fontSize: 15, fontWeight: '500' },
  optionSearch: { margin: 12, paddingHorizontal: 16, paddingVertical: 12, minHeight: 48, borderRadius: 14, backgroundColor: '#F1F5F3', color: '#121A16', fontSize: 15 },
  optionEmpty: { padding: 16, color: '#5A6761', fontSize: 15 },
  authTrigger: { backgroundColor: C.field, borderColor: 'transparent', borderWidth: 2, borderRadius: 16, height: 'auto', minHeight: 56, paddingLeft: 16, paddingRight: 16, paddingVertical: 12 },
  authText: { color: C.ink, fontSize: 16 },
  authLeadingIcon: { marginRight: 14 },
  authPlaceholder: { color: C.muted },
  authFocus: { backgroundColor: '#FFFFFF', borderColor: C.primary },
  authInvalid: { borderColor: C.error },
  staffContainer: { marginTop: 16 },
  staffLabel: { color: '#35463F', fontSize: 13, fontWeight: '600', marginBottom: 6 },
  staffTrigger: { backgroundColor: '#F1F5F3', borderWidth: 0, height: 'auto', minHeight: 52, paddingVertical: 12 },
  staffText: { color: '#121A16', fontSize: 16, fontWeight: '500' },
  staffCloseButton: { height: 44, width: 44 },
  container: { alignSelf: 'stretch' },
  label: { color: '#596a61', fontSize: 12, fontWeight: '700', marginBottom: 7 },
  trigger: {
    alignItems: 'center',
    backgroundColor: '#f8faf9',
    borderColor: '#dce4df',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 48,
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  triggerPressed: { backgroundColor: '#eef7f2' },
  disabled: { opacity: 0.55 },
  triggerText: { color: '#1c3027', flex: 1, minWidth: 0, fontSize: 16 },
  placeholder: { color: '#718b7f' },
  leadingIcon: { width: 20, height: 20, marginRight: 12, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chevron: { width: 20, height: 20, marginLeft: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  modalRoot: { flex: 1, justifyContent: 'center', paddingHorizontal: 20 },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(9, 31, 23, 0.42)' },
  modalCard: { backgroundColor: '#ffffff', borderColor: '#dce4df', borderRadius: 20, borderWidth: 1, maxHeight: '76%', overflow: 'hidden' },
  modalHeader: { alignItems: 'center', borderBottomColor: '#e5ece8', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16 },
  modalTitle: { color: '#17372b', flex: 1, fontSize: 18, fontWeight: '700' },
  closeButton: { alignItems: 'center', height: 32, justifyContent: 'center', marginLeft: 10, width: 32 },
  closeText: { color: '#718b7f', fontSize: 28, lineHeight: 30 },
  options: { padding: 8 },
  option: { alignItems: 'center', borderRadius: 12, flexDirection: 'row', justifyContent: 'space-between', minHeight: 52, paddingHorizontal: 14, paddingVertical: 10 },
  selectedOption: { backgroundColor: '#e8f6ef' },
  optionPressed: { backgroundColor: '#f0f7f3' },
  optionCopy: { flex: 1 },
  optionLabel: { color: '#1c3027', fontSize: 16 },
  selectedOptionLabel: { color: '#087f5b', fontWeight: '700' },
  optionDescription: { color: '#718b7f', fontSize: 12, marginTop: 3 },
  checkmark: { color: '#087f5b', fontSize: 20, fontWeight: '700', marginLeft: 12 },
});

// Explicit dark surface and foreground pairs; the light layout stays unchanged.
const darkStyles = {
  filterLabel: { color: darkPalette.text },
  filterTrigger: { backgroundColor: darkPalette.field },
  filterText: { color: darkPalette.text },
  optionSearch: { backgroundColor: darkPalette.field, color: darkPalette.text },
  optionEmpty: { color: darkPalette.muted },
  authTrigger: { backgroundColor: darkPalette.field },
  authText: { color: darkPalette.text },
  authPlaceholder: { color: darkPalette.muted },
  authFocus: { backgroundColor: darkPalette.surface },
  staffLabel: { color: darkPalette.text },
  staffTrigger: { backgroundColor: darkPalette.field },
  staffText: { color: darkPalette.text },
  label: { color: darkPalette.muted },
  trigger: { backgroundColor: darkPalette.surface, borderColor: darkPalette.border },
  triggerPressed: { backgroundColor: darkPalette.field },
  triggerText: { color: darkPalette.text },
  placeholder: { color: darkPalette.muted },
  modalCard: { backgroundColor: darkPalette.surface, borderColor: darkPalette.border },
  modalHeader: { borderBottomColor: darkPalette.border },
  modalTitle: { color: darkPalette.text },
  closeText: { color: darkPalette.muted },
  selectedOption: { backgroundColor: darkPalette.tint },
  optionPressed: { backgroundColor: darkPalette.field },
  optionLabel: { color: darkPalette.text },
  selectedOptionLabel: { color: darkPalette.accent },
  optionDescription: { color: darkPalette.muted },
  checkmark: { color: darkPalette.accent },
};
function useStyles(forceLight = false) {
  return useThemedStyles(styles, darkStyles, forceLight);
}
