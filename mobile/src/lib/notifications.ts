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
import { Platform } from 'react-native';
import type { UpcomingCollection } from '@/types/resident-schedule';

export const COLLECTION_NOTIFICATION_CHANNEL_ID = 'collection-reminders';
const COLLECTION_REMINDER_PREFIX = 'collection-reminder:';

// Show notifications even when the app is foregrounded (for in-app banner)
setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

async function ensureNotificationPermissionsAsync(): Promise<boolean> {
  if (Platform.OS === 'web') return false;

  if (Platform.OS === 'android') {
    await setNotificationChannelAsync(COLLECTION_NOTIFICATION_CHANNEL_ID, {
      name: 'Collection alerts',
      importance: AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      sound: 'default',
      // Show on lock screen (VISIBILITY_PUBLIC = 1)
      lockscreenVisibility: 1,
      showBadge: true,
      enableVibrate: true,
    });
  }

  const permission = await getPermissionsAsync();
  let granted = permission.granted;
  if (!granted) {
    const requested = await requestPermissionsAsync();
    granted = requested.granted;
  }

  return granted;
}

/**
 * Parse a time string like "6:00 AM" or "2:30 PM" into { hours, minutes }.
 */
function parseTimeString(timeStr: string): { hours: number; minutes: number } | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'AM' && hours === 12) hours = 0;
  else if (period === 'PM' && hours !== 12) hours += 12;
  return { hours, minutes };
}

/**
 * Parse the start time of a window string like "6:00 AM - 12:00 PM".
 * Returns a Date set to the given collectionDate at that start time, or null.
 */
function getWindowStartDate(collectionDate: Date, windowStr: string): Date | null {
  const parts = windowStr.split(/\s*[-–]\s*/);
  if (parts.length < 2) return null;
  const start = parseTimeString(parts[0]);
  if (!start) return null;

  const fireDate = new Date(collectionDate);
  fireDate.setHours(start.hours, start.minutes, 0, 0);
  return fireDate;
}

function getWasteLabel(wasteType: UpcomingCollection['wasteType']) {
  return wasteType === 'biodegradable' ? 'Biodegradable' : 'Non-biodegradable';
}

function getLocalDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export async function cancelScheduledCollectionReminders() {
  if (Platform.OS === 'web') return;

  const scheduledNotifications = await getAllScheduledNotificationsAsync();
  const collectionReminders = scheduledNotifications.filter((notification) =>
    notification.identifier.startsWith(COLLECTION_REMINDER_PREFIX),
  );

  await Promise.all(
    collectionReminders.map((notification) =>
      cancelScheduledNotificationAsync(notification.identifier),
    ),
  );
}

/**
 * Schedules one notification per collection time window start time.
 * Fires exactly when the collection window begins: "Collection is happening right now".
 * Does NOT schedule reminders the night before or in the morning.
 */
export async function scheduleCollectionReminders(
  collections: UpcomingCollection[],
  location: string,
): Promise<number> {
  if (!(await ensureNotificationPermissionsAsync())) return 0;

  await cancelScheduledCollectionReminders();

  const now = new Date();
  let scheduledCount = 0;

  for (const collection of collections) {
    const collectionDate = new Date(collection.date);
    const dateKey = getLocalDateKey(collection.date);
    if (Number.isNaN(collectionDate.getTime()) || !dateKey) continue;

    const wasteLabel = getWasteLabel(collection.wasteType);
    const reminderBase = `${COLLECTION_REMINDER_PREFIX}${dateKey}:${collection.wasteType}`;

    // Only schedule if we know the exact start time window(s)
    if (collection.timeWindows.length === 0) continue;

    for (let i = 0; i < collection.timeWindows.length; i++) {
      const windowStr = collection.timeWindows[i];
      const fireDate = getWindowStartDate(collectionDate, windowStr);

      // Skip if already past or unparseable
      if (!fireDate || fireDate <= now) continue;

      const id = `${reminderBase}:window-${i}`;

      await scheduleNotificationAsync({
        identifier: id,
        content: {
          title: 'Collection is happening right now',
          body: `${wasteLabel} waste collection is underway in ${location} (${windowStr}). Put out your waste now.`,
          sound: 'default',
          data: {
            screen: 'schedule',
            date: collection.date,
            wasteType: collection.wasteType,
          },
        },
        trigger: {
          type: SchedulableTriggerInputTypes.DATE,
          date: fireDate,
          channelId: COLLECTION_NOTIFICATION_CHANNEL_ID,
        },
      });

      scheduledCount += 1;
    }
  }

  return scheduledCount;
}

