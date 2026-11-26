import { SearchableSelect } from '@/components/searchable-select';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppText as Text } from '@/components/app-text';
import type { CollectionLocationOption } from '@/types/resident-schedule';

type BarangayPickerProps = {
  appearance?: 'default' | 'auth' | 'profile';
  invalid?: boolean;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
  value: string;
  onChange: (barangay: string) => void;
};

type LocationsResponse = {
  success: boolean;
  data?: CollectionLocationOption[];
  error?: string;
};

const API_URL = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '');

// Hide route instructions only in registration/profile choices. Keep the
// shared location records and any existing profile value intact.
const routeInstructionNames = new Set([
  'back to bagumbayan norte',
  'back to bagumbayan sur',
  'concepcion pequena to del rosario',
  'left to bagumbayan',
  'left to bagumbayan norte',
  'left to bagumbayan sur',
  'left to liboton route 1',
  'left to liboton route 2',
  'left to liboton route 1 and 2',
  'panganiban to rotonda left to magsaysay ave left to dayangdang',
  'right to colgante',
  'right to penafrancia',
  'rit to penafrancia',
  'u turn back to bagumbayan',
  'u turn back to bagumbayan norte',
  'u turn back to bagumbayan sur',
]);

function isProfileLocation(location: CollectionLocationOption) {
  const name = location.name.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[().]/g, '').replace(/[-\u2010-\u2015]/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return !routeInstructionNames.has(name);
}

export function BarangayPicker({ value, onChange, appearance = 'default', invalid = false, onSearchFocus, onSearchBlur }: BarangayPickerProps) {
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
        if (!cancelled) setLocations((result.data || []).filter(isProfileLocation));
      } catch (caughtError) {
        if (!cancelled) setError(caughtError instanceof Error ? caughtError.message : 'Unable to load collection locations.');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadLocations();
    return () => { cancelled = true; };
  }, []);


  return (
    <View style={{ alignSelf: 'stretch', width: '100%' }}>
      <SearchableSelect
        label="Collection location"
        onSearchFocus={onSearchFocus}
        onSearchBlur={onSearchBlur}
        hideLabel
        appearance={appearance}
        invalid={invalid}
        leadingIcon="map-pin"
        disabled={isLoading || Boolean(error) || locations.length === 0}
        onChange={onChange}
        options={locations.map((location) => ({ description: `${location.area} · ${location.type}`, label: location.name, value: location.name }))}
        placeholder={isLoading ? 'Loading locations…' : error ? 'Locations unavailable' : locations.length ? 'Select your collection location' : 'No locations found'}
        value={value}
      />
      {error ? <Text style={{ color: '#cc4251', fontSize: 11, marginTop: 7 }}>{error}</Text> : null}
    </View>
  );
}
