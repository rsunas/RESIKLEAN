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
  const chunks = expo.chunkPushNotifications(validMessages);
  const tickets = [];

  // 3. Send the chunks to the Expo push notification service with retry logic
  for (let chunk of chunks) {
    let attempts = 0;
    let success = false;

    while (attempts < MAX_RETRIES && !success) {
      try {
        attempts++;
        let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        tickets.push(...ticketChunk);
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
  
  for (let i = 0; i < tickets.length; i++) {
    const ticket = tickets[i];
    if (ticket.status === 'error' && ticket.details && ticket.details.error === 'DeviceNotRegistered') {
      invalidTokens.push(validMessages[i].to);
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

module.exports = {
  sendPushNotifications,
  cleanupTokens
};
