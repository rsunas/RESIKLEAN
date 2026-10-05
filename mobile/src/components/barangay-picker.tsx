import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { AppSelect } from '@/components/app-select';
import { AppText as Text } from '@/components/app-text';
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

  return (
    <View>
      <AppSelect
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
