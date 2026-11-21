import Constants from 'expo-constants';
import { isDevice } from 'expo-device';
import { Platform } from 'react-native';
import Storage from 'expo-sqlite/kv-store';
import { ensureNotificationPermissionsAsync } from './notifications';
import { requestJson } from './network-request';

const TOKEN_KEY = 'resident-expo-push-token';

export async function registerResidentPush(apiUrl: string, token: string) {
  if (Platform.OS === 'web' || !isDevice || Constants.appOwnership === 'expo') return;
  // Muting collection reminders must not prevent registration for other updates.
  if (!await ensureNotificationPermissionsAsync({ checkCollectionChannel: false })) return;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
  if (!projectId) throw new Error('Push notifications need an EAS project ID.');
  const { default: getExpoPushTokenAsync } = await import('expo-notifications/build/getExpoPushTokenAsync');
  const push = await getExpoPushTokenAsync({ projectId });
  const { response, payload } = await requestJson(`${apiUrl}/resident/push-token`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: push.data, platform: Platform.OS }),
  });
  if (!response.ok || !payload.success) throw new Error('Could not register this phone for notifications.');
  await Storage.setItem(TOKEN_KEY, push.data);
}

export async function unregisterResidentPush(apiUrl: string, token: string) {
  const pushToken = await Storage.getItem(TOKEN_KEY);
  if (!pushToken) return;
  const { response } = await requestJson(`${apiUrl}/resident/push-token`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pushToken }),
  }, 5000);
  if (response.ok) await Storage.removeItem(TOKEN_KEY);
}
