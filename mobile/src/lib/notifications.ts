// Use local-only modules directly. The package index initializes remote-push
// listeners in Expo Go, which is unsupported on Android SDK 53+.
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types';
import { getPermissionsAsync, requestPermissionsAsync } from 'expo-notifications/build/NotificationPermissions';
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types';
import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler';
import getAllScheduledNotificationsAsync from 'expo-notifications/build/getAllScheduledNotificationsAsync';
import cancelScheduledNotificationAsync from 'expo-notifications/build/cancelScheduledNotificationAsync';
import scheduleNotificationAsync from 'expo-notifications/build/scheduleNotificationAsync';
import setNotificationChannelAsync from 'expo-notifications/build/setNotificationChannelAsync';
import getNotificationChannelsAsync from 'expo-notifications/build/getNotificationChannelsAsync';
import setBadgeCountAsync from 'expo-notifications/build/setBadgeCountAsync';
import Storage from 'expo-sqlite/kv-store';
import { buildCollectionReminderPlan, shouldScheduleReminder } from './collection-reminder-plan';
import { Platform } from 'react-native';
import type { UpcomingCollection } from '@/types/resident-schedule';

export const COLLECTION_NOTIFICATION_CHANNEL_ID = 'collection-reminders';
const COLLECTION_REMINDER_PREFIX = 'collection-reminder:';

export function setAppNotificationBadgeCount(count: number) {
  if (Platform.OS === 'web') return Promise.resolve(false);
  return setBadgeCountAsync(Math.max(0, Math.min(99, Math.round(count)))).catch(() => false);
}

// Show notifications even when the app is foregrounded (for in-app banner)
setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let requestedPermission = false;
export async function ensureNotificationPermissionsAsync({ requestAgain = false }: { requestAgain?: boolean } = {}): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    if (Platform.OS === 'android') {
      await setNotificationChannelAsync(COLLECTION_NOTIFICATION_CHANNEL_ID, {
        name: 'Collection alerts',
        importance: AndroidImportance.HIGH,
        vibrationPattern: [0, 400, 200, 400],
        sound: 'default',
        lockscreenVisibility: 1,
        showBadge: true,
        enableVibrate: true,
      });
    }

    const permission = await getPermissionsAsync();
    let granted = permission.granted && permission.status !== 'denied';
    if (!granted && permission.canAskAgain !== false && (!requestedPermission || requestAgain)) {
      requestedPermission = true;
      const requested = await requestPermissionsAsync();
      granted = requested.granted && requested.status !== 'denied';
    }
    if (!granted) return false;
    // App permission and channel permission are separate on Android. Do not
    // mark reminders as scheduled while their channel is disabled by the user.
    if (Platform.OS === 'android') {
      const channels = await getNotificationChannelsAsync();
      if (channels.some(channel => channel.id === COLLECTION_NOTIFICATION_CHANNEL_ID && channel.importance === AndroidImportance.NONE)) return false;
    }
    return true;
  } catch (error) {
    console.warn('Unable to prepare local notifications:', error);
    return false;
  }
}

// Serialize scheduling, preference changes and sign-out to avoid overlapping updates.
let operations: Promise<unknown> = Promise.resolve();
function serialized<T>(action: () => Promise<T>): Promise<T> {
  const next = operations.then(action);
  operations = next.catch(() => undefined);
  return next;
}

const RECEIPTS_KEY = 'collection-reminder-receipts-v2';
const preferenceKey = (ownerId: string) => `collection-reminder-enabled:${ownerId}`;
type Receipts = Record<string, number>;
async function readReceipts(): Promise<Receipts> {
  const raw = await Storage.getItem(RECEIPTS_KEY);
  return raw ? JSON.parse(raw) as Receipts : {};
}

async function cancelReminders() {
  if (Platform.OS === 'web') return;
  const receipts = await readReceipts();
  const now = Date.now();
  for (const notification of await getAllScheduledNotificationsAsync()) {
    if (!notification.identifier.startsWith(COLLECTION_REMINDER_PREFIX)) continue;
    await cancelScheduledNotificationAsync(notification.identifier);
    if (receipts[notification.identifier] > now) delete receipts[notification.identifier];
  }
  await Storage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
}

export function cancelScheduledCollectionReminders() {
  return serialized(cancelReminders);
}

export function setCollectionReminderPreference(ownerId: string, enabled: boolean) {
  return serialized(async () => {
    if (Platform.OS === 'web') return;
    await Storage.setItem(preferenceKey(ownerId), JSON.stringify(enabled));
    if (!enabled) await cancelReminders();
  });
}

/** One start (including an in-window catch-up) and one end per collection window. */
export function scheduleCollectionReminders(collections: UpcomingCollection[], location: string, ownerId: string): Promise<number> {
  return serialized(async () => {
    if (Platform.OS === 'web' || !ownerId) return 0;
    if (await Storage.getItem(preferenceKey(ownerId)) === 'false') {
      await cancelReminders();
      return 0;
    }
    if (!(await ensureNotificationPermissionsAsync())) return 0;
    const now = Date.now();
    const plan = buildCollectionReminderPlan(collections, ownerId, location);
    const wanted = new Set(plan.map(item => item.id));
    const receipts = await readReceipts();
    // Retain recent receipts across restarts and sign-out without unbounded storage.
    for (const [id, dueAt] of Object.entries(receipts)) {
      if (dueAt < now - 2 * 86400000) delete receipts[id];
    }
    const scheduled = await getAllScheduledNotificationsAsync();
    const pending = new Set<string>();
    for (const notification of scheduled) {
      const id = notification.identifier;
      if (!id.startsWith(COLLECTION_REMINDER_PREFIX)) continue;
      if (!wanted.has(id)) {
        await cancelScheduledNotificationAsync(id);
        if (receipts[id] > now) delete receipts[id];
      } else {
        pending.add(id);
      }
    }
    await Storage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
    let count = 0;
    // Reserve room for other notifications under the iOS pending notification limit.
    let slots = Math.max(0, 60 - scheduled.filter(item => !item.identifier.startsWith(COLLECTION_REMINDER_PREFIX) || pending.has(item.identifier)).length);
    for (const reminder of plan) {
      if (!shouldScheduleReminder(reminder, now, receipts[reminder.id], pending.has(reminder.id))) continue;
      const immediate = reminder.dueAt <= now;
      if (!immediate && slots === 0) continue;
      const wasteLabel = reminder.wasteType === 'biodegradable' ? 'Biodegradable' : 'Non-biodegradable';
      try {
        await scheduleNotificationAsync({
          identifier: reminder.id,
          content: {
            title: reminder.phase === 'start' ? 'Collection is happening right now' : 'Collection window has ended',
            body: reminder.phase === 'start'
              ? `${wasteLabel} waste collection is scheduled now in ${location} (${reminder.window}). Put out your waste now.`
              : `The scheduled ${wasteLabel.toLowerCase()} collection window in ${location} (${reminder.window}) has ended.`,
            sound: 'default',
            data: { screen: 'collection', date: reminder.date, wasteType: reminder.wasteType, phase: reminder.phase },
          },
          trigger: immediate
            ? { channelId: COLLECTION_NOTIFICATION_CHANNEL_ID }
            : { type: SchedulableTriggerInputTypes.DATE, date: new Date(reminder.dueAt), channelId: COLLECTION_NOTIFICATION_CHANNEL_ID },
        });
      } catch (error) {
        console.warn(`Unable to schedule collection reminder for ${reminder.id}:`, error);
        throw error;
      }
      receipts[reminder.id] = immediate ? now : reminder.dueAt;
      // Persist every success even if a later notification fails to schedule.
      await Storage.setItem(RECEIPTS_KEY, JSON.stringify(receipts));
      if (!immediate) slots -= 1;
      count += 1;
    }
    return count;
  });
}


export async function getPhoneNotificationStatus(role: 'resident' | 'driver', tracking = false) {
  if (Platform.OS === 'web') return { allowed: false, message: 'Phone notifications are available in the installed app.', channelId: undefined as string | undefined };
  const permission = await getPermissionsAsync();
  if (!permission.granted || permission.status === 'denied') return { allowed: false, message: 'Phone notifications are off. Enable them to see collection and trip alerts.', channelId: undefined as string | undefined };
  const channels = Platform.OS === 'android' ? await getNotificationChannelsAsync() : [];
  // Expo Location names its own service channel using the app scope and task.
  const channel = role === 'driver'
    ? channels.find(item => item.id.endsWith(':resiklean-driver-route-proximity'))
    : channels.find(item => item.id === COLLECTION_NOTIFICATION_CHANNEL_ID);
  if (channel?.importance === AndroidImportance.NONE) return { allowed: false, message: 'This notification category is blocked in phone settings.', channelId: channel.id };
  if (role === 'driver') return { allowed: true, channelId: channel?.id, message: tracking
    ? 'Trip recording is enabled. Its notification may appear under silent notifications.'
    : 'Start a trip to show the GPS recording notification.' };
  const pending = (await getAllScheduledNotificationsAsync()).filter(item => item.identifier.startsWith(COLLECTION_REMINDER_PREFIX)).length;
  return { allowed: true, channelId: channel?.id, message: pending
    ? `${pending} collection reminders scheduled on this phone.`
    : 'No upcoming reminders scheduled. Check your collection schedule and reminder settings.' };
}

/** An explicit test only: never claim that GPS is running or collection has begun. */
export async function sendPhoneNotificationTest(role: 'resident' | 'driver', tracking = false) {
  const status = await getPhoneNotificationStatus(role, tracking);
  if (!status.allowed) throw new Error(status.message);
  if (role === 'driver' && tracking && Platform.OS === 'android' && !status.channelId) {
    throw new Error('The GPS notification channel is not ready. Return to the app and check the trip status.');
  }
  if (!status.channelId && !(await ensureNotificationPermissionsAsync({ requestAgain: true }))) {
    throw new Error('Enable Collection alerts in phone notification settings before testing.');
  }
  await scheduleNotificationAsync({
    identifier: `resiklean-notification-test:${role}`,
    content: { title: 'ResiKlean notification test', body: 'This is a test notification. It does not confirm GPS tracking or collection activity.', sound: 'default' },
    trigger: Platform.OS === 'android' ? { channelId: status.channelId || COLLECTION_NOTIFICATION_CHANNEL_ID } : null,
  });
}
