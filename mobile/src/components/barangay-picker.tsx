import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { RESIDENT_LOCATION_OPTIONS } from '@/constants/barangays';

type BarangayPickerProps = {
  value: string;
  onChange: (barangay: string) => void;
};

export function BarangayPicker({ value, onChange }: BarangayPickerProps) {
  const [isOpen, setIsOpen] = useState(false);

  const selectBarangay = (barangay: string) => {
    onChange(barangay);
    setIsOpen(false);
  };

  return (
    <View style={styles.container}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        onPress={() => setIsOpen((open) => !open)}
        style={styles.trigger}>
        <Feather color="#83938a" name="map-pin" size={18} />
        <Text numberOfLines={1} style={[styles.triggerText, !value && styles.placeholder]}>
          {value || 'Select your barangay'}
        </Text>
        <Feather color="#83938a" name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} />
      </Pressable>

      {isOpen ? (
        <View style={styles.dropdown}>
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {RESIDENT_LOCATION_OPTIONS.map((barangay) => {
              const selected = barangay === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={barangay}
                  onPress={() => selectBarangay(barangay)}
                  style={[styles.option, selected && styles.selectedOption]}>
                  <Text style={[styles.optionText, selected && styles.selectedOptionText]}>{barangay}</Text>
                  {selected ? <Feather color="#07815f" name="check" size={16} /> : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { alignSelf: 'stretch', position: 'relative', zIndex: 2 },
  trigger: {
    alignItems: 'center',
    borderColor: '#cfddd3',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    height: 53,
    paddingHorizontal: 14,
  },
  triggerText: { color: '#173322', flex: 1, fontSize: 15, marginLeft: 11 },
  placeholder: { color: '#8c9b93' },
  dropdown: {
    backgroundColor: '#ffffff',
    borderColor: '#cfddd3',
    borderRadius: 12,
    borderWidth: 1,
    elevation: 5,
    maxHeight: 220,
    marginTop: 5,
    overflow: 'hidden',
    shadowColor: '#173322',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    zIndex: 3,
  },
  option: {
    alignItems: 'center',
    borderBottomColor: '#edf2ee',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 42,
    paddingHorizontal: 13,
  },
  selectedOption: { backgroundColor: '#eaf8f0' },
  optionText: { color: '#34483d', flex: 1, fontSize: 13 },
  selectedOptionText: { color: '#07815f', fontWeight: '700' },
});
