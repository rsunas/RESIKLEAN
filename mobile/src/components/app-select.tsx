import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { AppText as Text } from '@/components/app-text';

export type AppSelectOption = {
  value: string;
  label: string;
  description?: string;
};

type AppSelectProps = {
  disabled?: boolean;
  label?: string;
  onChange: (value: string) => void;
  options: AppSelectOption[];
  placeholder?: string;
  value: string;
};

export function AppSelect({ disabled = false, label, onChange, options, placeholder = 'Select one', value }: AppSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selectedOption = options.find((option) => option.value === value);

  const selectOption = (option: AppSelectOption) => {
    onChange(option.value);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      {label ? <Text style={styles.label}>{label}</Text> : null}

      <Pressable
        accessibilityRole="button"
        disabled={disabled}
        onPress={() => setIsOpen(true)}
        style={({ pressed }) => [styles.trigger, pressed && styles.triggerPressed, disabled && styles.disabled]}>
        <Text style={[styles.triggerText, !selectedOption && styles.placeholder]}>
          {selectedOption?.label ?? placeholder}
        </Text>
        <Text style={styles.chevron}>⌄</Text>
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
        statusBarTranslucent
        transparent
        visible={isOpen}>
        <View style={styles.modalRoot}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setIsOpen(false)} style={styles.backdrop} />
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{label ?? placeholder}</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setIsOpen(false)} style={styles.closeButton}>
                <Text style={styles.closeText}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.options} showsVerticalScrollIndicator={false}>
              {options.map((option) => {
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
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
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
    paddingHorizontal: 13,
  },
  triggerPressed: { backgroundColor: '#eef7f2' },
  disabled: { opacity: 0.55 },
  triggerText: { color: '#1c3027', flex: 1, fontSize: 16 },
  placeholder: { color: '#718b7f' },
  chevron: { color: '#718b7f', fontSize: 24, lineHeight: 18, marginLeft: 10, marginTop: -8 },
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
