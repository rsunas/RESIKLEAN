const { Expo } = require('expo-server-sdk');
const User = require('../models/User');

const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 2000;

// Helper function to sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Create a new Expo SDK client
// optionally providing an access token if you have enabled push security
const expo = new Expo({ accessToken: process.env.EXPO_ACCESS_TOKEN });

/**
 * Sends push notifications to a list of tokens.
 * @param {Array<{ to: string, sound: string, title: string, body: string, data: object }>} messages 
 */
const sendPushNotifications = async (messages) => {
  // 1. Filter out invalid Expo push tokens
  const validMessages = messages.filter(msg => {
    if (!Expo.isExpoPushToken(msg.to)) {
      console.error(`Push token ${msg.to} is not a valid Expo push token`);
      return false;
    }
    return true;
  });

  if (validMessages.length === 0) return;

  // 2. The Expo push notification service accepts batches of notifications so
  // that you don't need to send 1000 requests to send 1000 notifications.
  const chunks = expo.chunkPushNotifications(validMessages.map(message => ({
    ...message,
    priority: message.priority || 'high',
    channelId: message.channelId || (message.data?.type === 'announcement'
      ? 'announcements' : message.data?.type === 'complaint' ? 'complaint-updates' : undefined),
  })));
  const tickets = [];

  // 3. Send the chunks to the Expo push notification service with retry logic
  for (let chunk of chunks) {
    let attempts = 0;
    let success = false;

    while (attempts < MAX_RETRIES && !success) {
      try {
        attempts++;
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk.map((ticket, index) => ({ ticket, to: chunk[index].to })));
        success = true;
      } catch (error) {
        console.error(`[Expo Push] Error sending chunk (Attempt ${attempts}/${MAX_RETRIES}):`, error.message);
        if (attempts >= MAX_RETRIES) {
          console.error(`[Expo Push] Failed to send push notification chunk after ${MAX_RETRIES} attempts.`);
        } else {
          await sleep(RETRY_DELAY_MS * attempts); // Exponential backoff (2s, 4s...)
        }
      }
    }
  }

  // 4. Check receipts to remove invalid/unregistered tokens
  // In a production app, receipt checking should ideally be done asynchronously 
  // later on, but we'll handle immediate 'DeviceNotRegistered' errors here.
  const invalidTokens = [];

  for (const { ticket, to } of tickets) {
    if (ticket.status === 'error') {
      console.error('[Expo Push] Rejected notification:', ticket.details?.error || 'UnknownError', ticket.message);
      if (ticket.details?.error === 'DeviceNotRegistered') invalidTokens.push(to);
    }
  }

  // Remove invalid tokens from database
  if (invalidTokens.length > 0) {
    await cleanupTokens(invalidTokens);
  }
};

/**
 * Removes unregistered tokens from all users
 * @param {string[]} tokens 
 */
const cleanupTokens = async (tokens) => {
  try {
    await User.updateMany(
      { 'pushTokens.token': { $in: tokens } },
      { $pull: { pushTokens: { token: { $in: tokens } } } }
    );
    console.log(`Cleaned up ${tokens.length} invalid push tokens.`);
  } catch (error) {
    console.error('Error cleaning up push tokens:', error);
  }
};

async function sendUserPush(user, message) {
  if (!user || user.notificationsEnabled === false || user.settings?.notifications?.pushEnabled === false) return;
  const tokens = [...new Set((user.pushTokens || [])
    .filter(item => item.isEnabled !== false)
    .map(item => item.token)
    .filter(Boolean))];
  if (!tokens.length) return;
  await sendPushNotifications(tokens.map(to => ({ to, sound: 'default', badge: 1, ...message })));
}

module.exports = {
  sendPushNotifications,
  sendUserPush,
  cleanupTokens
};
