import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, useColorScheme } from 'react-native';

export type ThemePreference = 'light' | 'dark';
export type AppLanguage = 'en' | 'fil';
type Preferences = { theme: ThemePreference; language: AppLanguage };
const KEY = 'resiklean.preferences.v1';
const defaults: Preferences = { theme: 'light', language: 'en' };
const Context = createContext<{ preferences: Preferences; updatePreferences: (next: Partial<Preferences>) => void } | null>(null);

export function AppPreferencesProvider({ children }: PropsWithChildren) {
  const [preferences, setPreferences] = useState(defaults);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    void SecureStore.getItemAsync(KEY).then(raw => {
      if (raw) {
        try { const value = JSON.parse(raw); setPreferences({ theme: value.theme === 'dark' ? 'dark' : 'light', language: value.language === 'fil' ? 'fil' : 'en' }); } catch { /* use defaults */ }
      }
      setHydrated(true);
    });
  }, []);
  useEffect(() => { if (hydrated) void SecureStore.setItemAsync(KEY, JSON.stringify(preferences)); }, [hydrated, preferences]);
  useEffect(() => { Appearance.setColorScheme(preferences.theme); }, [preferences.theme]);
  const updatePreferences = useCallback((next: Partial<Preferences>) => {
    setPreferences(current => ({ ...current, ...next }));
  }, []);
  const value = useMemo(() => ({ preferences, updatePreferences }), [preferences, updatePreferences]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAppPreferences() {
  const value = useContext(Context);
  if (!value) throw new Error('useAppPreferences must be used within AppPreferencesProvider');
  return value;
}

export function useAppTheme(): ThemePreference {
  return useAppPreferences().preferences.theme;
}

export function useAppLanguage(): AppLanguage {
  return useContext(Context)?.preferences.language ?? 'en';
}

export function useResolvedTheme(): ThemePreference {
  const preferred = useAppTheme();
  const system = useColorScheme();
  return preferred || (system === 'dark' ? 'dark' : 'light');
}
