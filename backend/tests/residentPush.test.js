const mockSend = jest.fn();
const mockUpdateMany = jest.fn().mockResolvedValue({});
jest.mock('expo-server-sdk', () => ({
  Expo: Object.assign(jest.fn().mockImplementation(() => ({
    chunkPushNotifications: messages => messages.map(message => [message]),
    sendPushNotificationsAsync: (...args) => mockSend(...args),
  })), { isExpoPushToken: value => value.startsWith('ExponentPushToken[') }),
}));
jest.mock('../src/models/User', () => ({ updateMany: (...args) => mockUpdateMany(...args) }));
const { sendPushNotifications, sendUserPush } = require('../src/services/notification.service');

beforeEach(() => { jest.clearAllMocks(); mockSend.mockReset(); });

test('announcement and complaint updates use their Android channels and high priority', async () => {
  mockSend.mockResolvedValue([{ status: 'ok', id: 'receipt' }]);
  await sendPushNotifications([{ to: 'ExponentPushToken[a]', data: { type: 'announcement' } }]);
  await sendUserPush({ pushTokens: [{ token: 'ExponentPushToken[b]' }] }, { title: 'Complaint update', data: { type: 'complaint' } });
  expect(mockSend.mock.calls[0][0][0]).toMatchObject({ channelId: 'announcements', priority: 'high' });
  expect(mockSend.mock.calls[1][0][0]).toMatchObject({ channelId: 'complaint-updates', priority: 'high', sound: 'default' });
});

test('disabled notifications do not send pushes', async () => {
  await sendUserPush({ notificationsEnabled: false, pushTokens: [{ token: 'ExponentPushToken[a]' }] }, {});
  await sendUserPush({ settings: { notifications: { pushEnabled: false } }, pushTokens: [{ token: 'ExponentPushToken[a]' }] }, {});
  expect(mockSend).not.toHaveBeenCalled();
});

test('failed earlier chunk cannot cause a later invalid token to remove the wrong device', async () => {
  jest.useFakeTimers();
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const info = jest.spyOn(console, 'log').mockImplementation(() => {});
  try {
    mockSend.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'))
      .mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([{ status: 'error', details: { error: 'DeviceNotRegistered' } }]);
    const pending = sendPushNotifications([
      { to: 'ExponentPushToken[a]', data: { type: 'announcement' } },
      { to: 'ExponentPushToken[b]', data: { type: 'complaint' } },
    ]);
    await jest.runAllTimersAsync();
    await pending;
    expect(mockUpdateMany).toHaveBeenCalledWith(
      { 'pushTokens.token': { $in: ['ExponentPushToken[b]'] } },
      { $pull: { pushTokens: { token: { $in: ['ExponentPushToken[b]'] } } } },
    );
  } finally { jest.useRealTimers(); log.mockRestore(); info.mockRestore(); }
});
