import { useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { AppText as Text } from '@/components/app-text';
import { useAppTheme } from '@/hooks/app-preferences';
import { darkPalette } from '@/constants/mobile-palette';

const centimetreSuggestions = Array.from({ length: 31 }, (_, index) => String(100 + index * 10));
const metreSuggestions = Array.from({ length: 31 }, (_, index) => index === 0 ? '0' : (index / 10).toFixed(1));

export function PileHeightInput({ label, unit, value, onChange, open, onOpenChange }: {
  label: string;
  unit: 'cm' | 'm';
  value: string;
  onChange: (value: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isDark = useAppTheme() === 'dark';
  const input = useRef<TextInput>(null);
  const [filterByInput, setFilterByInput] = useState(false);
  const suggestions = unit === 'cm' ? centimetreSuggestions : metreSuggestions;
  const query = value.trim();
  const matches = filterByInput && query !== ''
    ? suggestions.filter(suggestion => suggestion.startsWith(query) || Number(suggestion) === Number(query))
    : suggestions;
  const customValue = filterByInput && /^\d*\.?\d+$/.test(query)
    && !suggestions.some(suggestion => Number(suggestion) === Number(query));
  const visibleSuggestions = customValue ? [query, ...matches] : matches;
  const foreground = isDark ? darkPalette.text : '#121A16';
  const muted = isDark ? darkPalette.muted : '#5A6761';

  return <View>
    <View style={[styles.field, isDark && { backgroundColor: darkPalette.field }]}>
      <TextInput
        ref={input}
        accessibilityLabel={label}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={text => {
          onChange(text);
          setFilterByInput(true);
          onOpenChange(true);
        }}
        onFocus={() => { setFilterByInput(true); onOpenChange(true); }}
        onSubmitEditing={() => onOpenChange(false)}
        placeholder="0"
        placeholderTextColor={muted}
        style={[styles.input, { color: foreground }]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${open && !filterByInput ? 'Hide' : 'Show all'} ${label} suggestions`}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          input.current?.blur();
          Keyboard.dismiss();
          setFilterByInput(false);
          onOpenChange(!open || filterByInput);
        }}
        style={styles.toggle}
      >
        <Feather name={open && !filterByInput ? 'chevron-up' : 'chevron-down'} size={18} color={muted} />
      </Pressable>
    </View>
    {open ? <ScrollView
      nestedScrollEnabled
      keyboardShouldPersistTaps="always"
      style={[styles.list, isDark && { backgroundColor: darkPalette.surface, borderColor: darkPalette.border }]}
    >
      {visibleSuggestions.map(suggestion => {
        const selected = value.trim() !== '' && Number(value) === Number(suggestion);
        return <Pressable
          key={suggestion}
          accessibilityRole="button"
          accessibilityLabel={`${label}: ${suggestion} ${unit}`}
          accessibilityState={{ selected }}
          onPress={() => {
            input.current?.blur();
            onChange(suggestion);
            onOpenChange(false);
            Keyboard.dismiss();
          }}
          style={[styles.option, selected && { backgroundColor: isDark ? darkPalette.tint : '#E3F4EB' }]}
        >
          <Text style={[styles.optionText, { color: foreground }]}>{suggestion}</Text>
        </Pressable>;
      })}
      {visibleSuggestions.length === 0 ? <Text style={[styles.empty, { color: muted }]}>Keep typing a height, or use the arrow for suggestions.</Text> : null}
    </ScrollView> : null}
  </View>;
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderRadius: 14, backgroundColor: '#F1F5F3' },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingVertical: 12, paddingLeft: 10, paddingRight: 0, fontSize: 16, fontWeight: '500' },
  toggle: { width: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  list: { maxHeight: 192, marginTop: 6, borderWidth: 1, borderColor: '#D5DDD9', borderRadius: 14, backgroundColor: '#FFFFFF' },
  option: { minHeight: 44, paddingVertical: 12, paddingHorizontal: 10, justifyContent: 'center' },
  optionText: { fontSize: 16, fontWeight: '500' },
  empty: { padding: 10, fontSize: 12 },
});
