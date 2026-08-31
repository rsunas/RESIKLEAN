import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { UpcomingCollection } from '@/types/resident-schedule';

export const COLLECTION_NOTIFICATION_CHANNEL_ID = 'collection-reminders';
const COLLECTION_REMINDER_PREFIX = 'collection-reminder:';
const COLLECTION_REMINDER_HOUR = 19;
const COLLECTION_MORNING_REMINDER_HOUR = 5;

Notifications.setNotificationHandler({
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
    await Notifications.setNotificationChannelAsync(COLLECTION_NOTIFICATION_CHANNEL_ID, {
      name: 'Collection reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }

  const permission = await Notifications.getPermissionsAsync();
  let finalStatus = permission.status;
  if (finalStatus !== Notifications.PermissionStatus.GRANTED) {
    const requested = await Notifications.requestPermissionsAsync();
    finalStatus = requested.status;
  }

  return finalStatus === Notifications.PermissionStatus.GRANTED;
}

function getLocalDateKey(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function getReminderDate(collectionDate: Date, hour: number, daysBefore = 0) {
  const reminderDate = new Date(collectionDate);
  reminderDate.setDate(reminderDate.getDate() - daysBefore);
  reminderDate.setHours(hour, 0, 0, 0);
  return reminderDate;
}

function getWasteLabel(wasteType: UpcomingCollection['wasteType']) {
  return wasteType === 'biodegradable' ? 'Biodegradable' : 'Non-biodegradable';
}

export async function cancelScheduledCollectionReminders() {
  if (Platform.OS === 'web') return;

  const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();
  const collectionReminders = scheduledNotifications.filter((notification) => (
    notification.identifier.startsWith(COLLECTION_REMINDER_PREFIX)
  ));

  await Promise.all(collectionReminders.map((notification) => (
    Notifications.cancelScheduledNotificationAsync(notification.identifier)
  )));
}

export async function scheduleCollectionReminders(collections: UpcomingCollection[], location: string) {
  if (!(await ensureNotificationPermissionsAsync())) return 0;

  await cancelScheduledCollectionReminders();

  const now = new Date();
  let scheduledCount = 0;

  for (const collection of collections) {
    const collectionDate = new Date(collection.date);
    const dateKey = getLocalDateKey(collection.date);
    if (Number.isNaN(collectionDate.getTime()) || !dateKey) continue;

    const wasteLabel = getWasteLabel(collection.wasteType);
    const timeWindow = collection.timeWindows.length ? ` (${collection.timeWindows.join(' · ')})` : '';
    const reminderBase = `${COLLECTION_REMINDER_PREFIX}${dateKey}:${collection.wasteType}`;
    const reminders = [
      {
        id: `${reminderBase}:evening`,
        date: getReminderDate(collectionDate, COLLECTION_REMINDER_HOUR, 1),
        title: 'Collection tomorrow',
        body: `${wasteLabel} waste collection in ${location} is tomorrow${timeWindow}.`,
      },
      {
        id: `${reminderBase}:morning`,
        date: getReminderDate(collectionDate, COLLECTION_MORNING_REMINDER_HOUR),
        title: 'Collection today',
        body: `Put out ${wasteLabel.toLowerCase()} waste for collection in ${location}${timeWindow}.`,
      },
    ];

    for (const reminder of reminders) {
      if (reminder.date <= now) continue;

      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: {
          title: reminder.title,
          body: reminder.body,
          sound: 'default',
          data: { screen: 'schedule', date: collection.date, wasteType: collection.wasteType },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: reminder.date,
          channelId: COLLECTION_NOTIFICATION_CHANNEL_ID,
        },
      });
      scheduledCount += 1;
    }
  }

  return scheduledCount;
}

export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;

  if (!(await ensureNotificationPermissionsAsync())) return null;

  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID
    || Constants.expoConfig?.extra?.eas?.projectId
    || Constants.easConfig?.projectId;
  if (!projectId) {
    throw new Error('EAS projectId is not configured. Run eas init before registering push notifications.');
  }

  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  return token.data;
}
