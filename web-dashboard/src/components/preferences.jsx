import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const PreferenceContext = createContext(null);
const defaults = { theme: 'light', language: 'en' };

export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(() => {
    try {
      return { ...defaults, ...JSON.parse(localStorage.getItem('resiklean-admin-preferences') || '{}') };
    } catch { return defaults; }
  });
  useEffect(() => {
    document.documentElement.dataset.theme = preferences.theme === 'dark' ? 'dark' : 'light';
    document.documentElement.lang = preferences.language === 'fil' ? 'fil' : 'en';
    localStorage.setItem('resiklean-admin-preferences', JSON.stringify(preferences));
  }, [preferences]);
  const value = useMemo(() => ({ preferences, setPreferences }), [preferences]);
  return <PreferenceContext.Provider value={value}>{children}</PreferenceContext.Provider>;
}

export function usePreferences() {
  const value = useContext(PreferenceContext);
  if (!value) throw new Error('usePreferences must be used inside PreferencesProvider');
  return value;
}

const filipino = {
  Overview: 'Pangkalahatang-ideya', 'Route History': 'Kasaysayan ng Ruta', Complaints: 'Mga Reklamo',
  'Waste Generation': 'Pagbuo ng Basura', 'Manage Routes': 'Pamamahala ng mga Ruta',
  'Driver Assignments': 'Mga Itinalagang Driver', 'Manage Accounts': 'Pamamahala ng mga Account',
  'Manage Trucks': 'Pamamahala ng mga Truck', Notifications: 'Mga Abiso', Settings: 'Mga Setting',
  'Sign out': 'Mag-sign out', Light: 'Maliwanag', Dark: 'Madilim', English: 'Ingles', Filipino: 'Filipino',
  'Appearance and language': 'Hitsura at wika', Account: 'Account',
  Security: 'Seguridad', 'Manage your account, appearance, notifications, and security.': 'Pamahalaan ang account, hitsura, mga notification, at seguridad.',
  'Personalize how the dashboard looks.': 'Ipasadya ang hitsura ng dashboard.', Theme: 'Tema', Language: 'Wika',
  'The dashboard color scheme.': 'Tema ng kulay ng dashboard.', 'Language used across the dashboard.': 'Wikang ginagamit sa dashboard.',
  'Choose what you want to be told about.': 'Piliin kung anong mga abiso ang matatanggap mo.',
  'Your profile on the dashboard.': 'Iyong profile sa dashboard.', 'Edit profile': 'I-edit ang profile',
  'Change password': 'Palitan ang password', 'Save changes': 'I-save ang mga pagbabago', Cancel: 'Kanselahin',
  'Collection Overview': 'Pangkalahatang Koleksyon',
  'Route management': 'Pamamahala ng Ruta', 'Driver assignments': 'Mga Itinalagang Driver',
  'Truck management': 'Pamamahala ng Truck', 'Complaint queue': 'Pila ng mga Reklamo',
  'Allow push notifications on devices registered to your account.': 'Payagan ang mga push notification sa mga device na nakarehistro sa iyong account.',
  'New complaints appear in the Notifications feed.': 'Lumilitaw ang mga bagong reklamo sa feed ng Mga Abiso.',
  'Truckload submissions appear in the Notifications feed.': 'Lumilitaw ang mga isinumiteng karga ng trak sa feed ng Mga Abiso.',
  'In dashboard feed': 'Nasa feed ng dashboard',
  'Change the password you use to sign in.': 'Palitan ang password na ginagamit mo sa pag-sign in.',
  'Keep your account safe.': 'Panatilihing ligtas ang iyong account.', 'Push notifications': 'Mga push notification',
  'New complaints': 'Mga bagong reklamo', 'Truckload submissions': 'Mga isinumiteng karga ng trak',
  'Rows per page': 'Mga hilera bawat pahina', Password: 'Password',
};
export function translate(text, language) { return language === 'fil' ? (filipino[text] || text) : text; }
