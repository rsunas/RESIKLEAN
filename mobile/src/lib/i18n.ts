import type { AppLanguage } from '@/hooks/app-preferences';

const fil: Record<string, string> = {
  Home: 'Tahanan', News: 'Balita', Complaint: 'Reklamo', Complaints: 'Mga Reklamo', Profile: 'Profile',
  Map: 'Mapa', 'Route History': 'Kasaysayan ng Ruta', Settings: 'Mga Setting', 'Settings & Preferences': 'Mga Setting at Kagustuhan',
  Appearance: 'Hitsura', Theme: 'Tema', Light: 'Maliwanag', Dark: 'Madilim', System: 'System',
  Language: 'Wika', 'App Language': 'Wika ng App', 'Select the language used across the app': 'Piliin ang wikang gagamitin sa app',
  English: 'Ingles', Filipino: 'Filipino', Notifications: 'Mga Abiso', 'Push Notifications': 'Mga Push Notification',
  'Master toggle for all notifications': 'Pangkalahatang kontrol ng mga abiso', 'Collection Reminders': 'Mga Paalala sa Koleksyon',
  'Get notified before your collection day': 'Abisuhan bago ang araw ng koleksyon', 'Schedule Updates': 'Mga Update sa Iskedyul',
  Announcements: 'Mga Anunsyo', 'Change Password': 'Palitan ang Password', 'Update Password': 'I-update ang Password',
  'Set Password': 'Magtakda ng Password', 'Current Password': 'Kasalukuyang Password', 'New Password': 'Bagong Password',
  'Confirm New Password': 'Kumpirmahin ang Bagong Password', Cancel: 'Kanselahin', Save: 'I-save', Back: 'Bumalik',
  'Edit Profile': 'I-edit ang Profile', 'Sign Out': 'Mag-sign Out', 'Collection checklist': 'Listahan ng mga Koleksyon',
  'Finish route': 'Tapusin ang Ruta', 'End trip': 'Tapusin ang Biyahe', 'Start trip': 'Simulan ang Biyahe',
  Pending: 'Nakabinbin', Collected: 'Nakolekta', 'For review': 'Para Suriin', 'No stops collected yet.': 'Wala pang nakolektang hinto.',
  'Truck emptied': 'Naibaba na ang laman ng trak', 'Route progress': 'Pag-usad ng Ruta',
  'Past collections': 'Mga Nakaraang Koleksyon', 'Download route map': 'I-download ang mapa ng ruta',
  'Privacy Policy': 'Patakaran sa Privacy', 'Collection Schedule': 'Iskedyul ng Koleksyon',
  'New complaint': 'Bagong reklamo', Subject: 'Paksa', Message: 'Mensahe', 'Photo proof': 'Larawang patunay',
  'Take photo proof': 'Kumuha ng larawang patunay', 'Send complaint': 'Ipadala ang reklamo',
  'Waste Segregation Guide': 'Gabay sa Paghihiwalay ng Basura', 'Frequently Asked Questions': 'Mga Madalas Itanong',
  'Biodegradable': 'Nabubulok', 'Non-Biodegradable': 'Di-nabubulok', Recyclables: 'Nare-recycle', Hazardous: 'Mapanganib',
};

export function translate(text: string, language: AppLanguage): string {
  return language === 'fil' ? (fil[text] ?? text) : text;
}
