import { Feather } from 'expo/node_modules/@expo/vector-icons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CollectionLocationOption } from '@/types/resident-schedule';

type BarangayPickerProps = {
  value: string;
  onChange: (barangay: string) => void;
};

type LocationsResponse = {
  success: boolean;
  data?: CollectionLocationOption[];
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

export function BarangayPicker({ value, onChange }: BarangayPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [locations, setLocations] = useState<CollectionLocationOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadLocations = async () => {
      if (!API_URL) {
        if (!cancelled) {
          setError('Location service is not configured.');
          setIsLoading(false);
        }
        return;
      }

      try {
        const response = await fetch(`${API_URL}/collection-locations`);
        const result = (await response.json()) as LocationsResponse;
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load collection locations.');
        if (!cancelled) setLocations(result.data || []);
      } catch (caughtError) {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load collection locations.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadLocations();
    return () => { cancelled = true; };
  }, []);

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
          {value || 'Select your collection location'}
        </Text>
        {isLoading ? <ActivityIndicator color="#07815f" size="small" /> : <Feather color="#83938a" name={isOpen ? 'chevron-up' : 'chevron-down'} size={18} />}
      </Pressable>

      {isOpen ? (
        <View style={styles.dropdown}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          {!isLoading && !error && !locations.length ? <Text style={styles.emptyText}>No collection locations found.</Text> : null}
          <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false}>
            {locations.map((location) => {
              const selected = location.name === value;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  key={location._id}
                  onPress={() => selectBarangay(location.name)}
                  style={[styles.option, selected && styles.selectedOption]}>
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionText, selected && styles.selectedOptionText]}>{location.name}</Text>
                    <Text style={styles.optionMeta}>{location.area} · {location.type}</Text>
                  </View>
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
  optionTextWrap: { flex: 1 },
  optionText: { color: '#34483d', fontSize: 13 },
  optionMeta: { color: '#8a9a91', fontSize: 10, marginTop: 2, textTransform: 'capitalize' },
  selectedOptionText: { color: '#07815f', fontWeight: '700' },
  errorText: { color: '#cc4251', fontSize: 11, padding: 12 },
  emptyText: { color: '#89978f', fontSize: 11, padding: 12 },
});
