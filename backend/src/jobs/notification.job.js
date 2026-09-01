const cron = require('node-cron');
const { formatInTimeZone } = require('date-fns-tz');
const User = require('../models/User');
const Route = require('../models/Route');
const CollectionLocation = require('../models/CollectionLocation');
const { sendPushNotifications } = require('../services/notification.service');

const TIMEZONE = 'Asia/Manila';
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Finds all active routes and collection locations for a given day name (e.g. 'Monday').
 * Then finds residents belonging to them and sends notifications.
 * 
 * @param {Date} targetDate The date we are checking for collections
 * @param {String} type "night-before" or "collection-day"
 */
const sendRemindersForDate = async (targetDate, type) => {
  try {
    const dayOfWeekStr = formatInTimeZone(targetDate, TIMEZONE, 'EEEE'); // e.g. 'Monday'
    const dayOfWeekNum = DAY_NAMES.indexOf(dayOfWeekStr); // 0 = Sunday, 1 = Monday, etc.

    // 1. Find legacy routes scheduled for this day
    const scheduledRoutes = await Route.find({ 
      isActive: true, 
      schedule: dayOfWeekNum 
    }).lean();

    // 2. Find new CollectionLocations scheduled for this day
    const scheduledLocations = await CollectionLocation.find({
      'schedules.days': dayOfWeekStr
    }).lean();

    const pushMessages = [];
    const notifiedUserIds = new Set(); // Prevent duplicates

    // --- Process Routes ---
    for (const route of scheduledRoutes) {
      // Find users assigned to this route's barangay OR explicitly linked to it
      const users = await User.find({
        role: 'resident',
        notificationsEnabled: true,
        $or: [
          { home_segment_id: route._id },
          { barangay: route.barangay }
        ],
        pushTokens: { $exists: true, $not: { $size: 0 } }
      });

      const wasteType = (dayOfWeekNum === 0 || dayOfWeekNum === 4) ? 'non-biodegradable' : 'biodegradable';

      for (const user of users) {
        if (notifiedUserIds.has(user._id.toString())) continue;
        notifiedUserIds.add(user._id.toString());

        const messageBody = type === 'night-before' 
          ? `Reminder: Tomorrow is collection day for ${wasteType} waste in ${route.name}.`
          : `Today is collection day for ${wasteType} waste in ${route.name}. Please bring out your trash.`;

        for (const pt of user.pushTokens) {
          if (!pt.isEnabled) continue;
          pushMessages.push({
            to: pt.token,
            sound: 'default',
            title: 'Resiklean Collection Reminder',
            body: messageBody,
            data: { 
              screen: 'schedule', 
              date: targetDate.toISOString(),
              wasteType,
              location: route.name,
              timeWindow: null // Routes currently don't specify timeWindows in the schema
            }
          });
        }
      }
    }

    // --- Process CollectionLocations ---
    for (const loc of scheduledLocations) {
      // Get the schedule specifically for this day to find wasteType
      const schedule = loc.schedules.find(s => s.days.includes(dayOfWeekStr));
      if (!schedule) continue;
      const wasteType = schedule.wasteType;

      const users = await User.find({
        role: 'resident',
        notificationsEnabled: true,
        location: loc.name,
        pushTokens: { $exists: true, $not: { $size: 0 } }
      });

      for (const user of users) {
        if (notifiedUserIds.has(user._id.toString())) continue;
        notifiedUserIds.add(user._id.toString());

        const messageBody = type === 'night-before' 
          ? `Reminder: Tomorrow is collection day for ${wasteType} waste in ${loc.name}.`
          : `Today is collection day for ${wasteType} waste in ${loc.name}. Please bring out your trash.`;

        for (const pt of user.pushTokens) {
          if (!pt.isEnabled) continue;
          pushMessages.push({
            to: pt.token,
            sound: 'default',
            title: 'Resiklean Collection Reminder',
            body: messageBody,
            data: { 
              screen: 'schedule', 
              date: targetDate.toISOString(),
              wasteType,
              location: loc.name,
              timeWindow: schedule.timeWindows && schedule.timeWindows.length > 0 ? schedule.timeWindows[0] : null
            }
          });
        }
      }
    }

    if (pushMessages.length > 0) {
      await sendPushNotifications(pushMessages);
      console.log(`[Notification Job] Sent ${pushMessages.length} ${type} reminders for ${dayOfWeekStr}.`);
    } else {
      console.log(`[Notification Job] No ${type} reminders needed for ${dayOfWeekStr}.`);
    }

  } catch (error) {
    console.error(`[Notification Job] Error running ${type} reminder job:`, error);
  }
};

const initJobs = () => {
  // Night-before reminders: runs daily at 7:00 PM
  cron.schedule('0 19 * * *', () => {
    console.log('[Notification Job] Running night-before reminders...');
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    sendRemindersForDate(tomorrow, 'night-before');
  }, {
    timezone: TIMEZONE
  });

  // Collection-day reminders: runs daily at 5:00 AM
  cron.schedule('0 5 * * *', () => {
    console.log('[Notification Job] Running collection-day reminders...');
    const today = new Date();
    sendRemindersForDate(today, 'collection-day');
  }, {
    timezone: TIMEZONE
  });

  console.log(`[Notification Job] Scheduled night-before (19:00) and collection-day (05:00) jobs in ${TIMEZONE}`);
};

module.exports = { initJobs };
