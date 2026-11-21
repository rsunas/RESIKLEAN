const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');

function load(name, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(`${__dirname}/../src/lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const output = {};
  new Function('exports', 'require', code)(output, key => {
    assert.ok(key in imports, `Unexpected import ${key}`);
    return imports[key];
  });
  return output;
}

async function main() {
  const planner = load('collection-reminder-plan');
  const collection = { date: '2026-11-18', wasteType: 'biodegradable', dayName: 'Wednesday', timeWindows: ['4:00 AM–8:00 AM', '9:00 AM - 1:00 PM'] };
  const plan = planner.buildCollectionReminderPlan([collection], 'resident-a', 'Abella');
  assert.equal(plan.length, 4);
  assert.equal(plan[0].dueAt, Date.parse('2026-11-18T04:00:00+08:00'));
  assert.equal(planner.collectionDateKey('2026-11-17T20:00:00Z'), '2026-11-18');
  assert.equal(planner.collectionDateKey('invalid'), null);
  const reversed = planner.buildCollectionReminderPlan([{ ...collection, timeWindows: [...collection.timeWindows].reverse() }], 'resident-a', 'Abella');
  assert.deepEqual(plan.map(item => item.id), reversed.map(item => item.id));
  const overnight = planner.buildCollectionReminderPlan([{ ...collection, timeWindows: ['10:00 PM — 2:00 AM'] }], 'resident-a', 'Abella');
  assert.equal(overnight[1].dueAt, Date.parse('2026-11-19T02:00:00+08:00'));
  assert.equal(planner.buildCollectionReminderPlan([{ ...collection, timeWindows: ['13:00 AM - 2:00 PM', '8:70 AM - 9:00 AM', 'bad'] }], 'a', 'b').length, 0);

  const storage = new Map();
  const pending = new Map();
  let sent = [];
  let now = Date.parse('2026-11-18T06:00:00+08:00');
  let failEnd = false;
  let permissionGranted = true;
  let canAskAgain = true;
  let requests = 0;
  let channels = [];
  let grantOnRequest = false;
  const originalNow = Date.now;
  Date.now = () => now;
  const imports = {
    './collection-reminder-plan': planner,
    'react-native': { Platform: { OS: 'android' } },
    'expo-sqlite/kv-store': { default: {
      getItem: async key => storage.get(key) ?? null,
      setItem: async (key, value) => { storage.set(key, value); },
    } },
    'expo-notifications/build/NotificationChannelManager.types': { AndroidImportance: { HIGH: 4, NONE: 0 } },
    'expo-notifications/build/NotificationPermissions': {
      getPermissionsAsync: async () => ({ granted: permissionGranted, canAskAgain }),
      requestPermissionsAsync: async () => { requests++; if (grantOnRequest) permissionGranted = true; return { granted: permissionGranted }; },
    },
    'expo-notifications/build/Notifications.types': { SchedulableTriggerInputTypes: { DATE: 'date' } },
    'expo-notifications/build/NotificationsHandler': { setNotificationHandler: () => {} },
    'expo-notifications/build/getNotificationChannelsAsync': { default: async () => channels },
    'expo-notifications/build/setBadgeCountAsync': { default: async () => true },
    'expo-notifications/build/setNotificationChannelAsync': { default: async () => {} },
    'expo-notifications/build/getAllScheduledNotificationsAsync': { default: async () => [...pending.values()] },
    'expo-notifications/build/cancelScheduledNotificationAsync': { default: async id => { pending.delete(id); } },
    'expo-notifications/build/scheduleNotificationAsync': { default: async notification => {
      if (failEnd && notification.content.data?.phase === 'end') throw new Error('OS failure');
      sent.push(notification);
      if (notification.trigger.date) pending.set(notification.identifier, notification);
      return notification.identifier;
    } },
  };
  const reset = () => { storage.clear(); pending.clear(); sent = []; };
  const singleWindow = [{ ...collection, timeWindows: [collection.timeWindows[0]] }];
  let api = load('notifications', imports);
  const reconcile = () => api.scheduleCollectionReminders(singleWindow, 'Abella', 'resident-a');
  try {
    await Promise.all([reconcile(), reconcile(), reconcile()]);
    assert.equal(sent.length, 2, 'mid-window catch-up + end, even with overlapping updates');
    assert.equal(sent[0].trigger.date, undefined, 'catch-up is immediate');
    assert.equal(sent[1].trigger.date.getTime(), Date.parse('2026-11-18T08:00:00+08:00'));
    api = load('notifications', imports);
    await reconcile();
    assert.equal(sent.length, 2, 'restart cannot replay catch-up');
    await api.cancelScheduledCollectionReminders();
    assert.equal(pending.size, 0);
    await reconcile();
    assert.equal(sent.length, 3, 'sign-in restores future end, not past start');
    await api.setCollectionReminderPreference('resident-a', false);
    await reconcile();
    assert.equal(pending.size, 0, 'disabled preferences cancel pending alerts');
    assert.equal(sent.length, 3);
    await api.setCollectionReminderPreference('resident-a', true);
    await reconcile();
    assert.equal(sent.length, 4, 're-enable restores only the future end');
    now = Date.parse('2026-11-18T08:01:00+08:00');
    pending.clear(); // Simulate the OS delivering the end while app was closed.
    await reconcile();
    assert.equal(sent.length, 4, 'no expired start or end replay');

    reset();
    now = Date.parse('2026-11-18T03:00:00+08:00');
    await reconcile();
    assert.equal(pending.size, 2, 'before start both alerts are scheduled');
    now = Date.parse('2026-11-18T06:00:00+08:00');
    pending.delete(plan[0].id); // Start already delivered by the OS.
    await reconcile();
    assert.equal(sent.length, 2, 'no catch-up after scheduled start already fired');
    await api.scheduleCollectionReminders(singleWindow, 'Tinago', 'resident-a');
    assert.ok([...pending.keys()].every(id => id.includes('tinago')), 'location change cancels old pending alerts');
    await api.scheduleCollectionReminders(singleWindow, 'Abella', 'resident-b');
    assert.ok([...pending.keys()].every(id => id.includes('resident-b')), 'account scope remains isolated');

    reset();
    failEnd = true;
    await assert.rejects(reconcile(), /OS failure/);
    failEnd = false;
    await reconcile();
    assert.equal(sent.length, 2, 'retry failure without replaying successful catch-up');
    reset();
    permissionGranted = false;
    await reconcile();
    assert.equal(sent.length, 0, 'respect denied OS permission');
    permissionGranted = true;
    await api.scheduleCollectionReminders([], 'Abella', 'resident-a');
    assert.equal(pending.size, 0, 'empty schedule is safe');
    reset();
    now = Date.parse('2026-11-18T06:00:00+08:00');
    channels = [{ id: 'collection-reminders-v2', importance: 0 }];
    await reconcile();
    assert.equal(sent.length, 0, 'blocked category must not consume reminder receipts');
    assert.equal((await api.getPhoneNotificationStatus('resident')).allowed, false);
    assert.equal(await api.ensureNotificationPermissionsAsync({ checkCollectionChannel: false }), true, 'muting collections must not block registration for announcements and complaints');
    channels[0].importance = 4;
    await reconcile();
    assert.equal(sent.length, 2, 'enabling category restores catch-up and upcoming reminders');
    const driverChannel = { id: 'app:resiklean-driver-route-proximity', importance: 0 };
    channels.push(driverChannel);
    assert.equal((await api.getPhoneNotificationStatus('driver', true)).allowed, false);
    await assert.rejects(api.sendPhoneNotificationTest('driver', true), /blocked/);
    driverChannel.importance = 2;
    await api.sendPhoneNotificationTest('driver', true);
    assert.equal(sent.at(-1).trigger.channelId, driverChannel.id, 'test the actual GPS service category');
    assert.equal(sent.at(-1).content.title, 'ResiKlean notification test');
    permissionGranted = false;
    const before = requests;
    await api.ensureNotificationPermissionsAsync();
    assert.equal(requests, before, 'automatic checks must not repeatedly prompt');
    grantOnRequest = true;
    assert.equal(await api.ensureNotificationPermissionsAsync({ requestAgain: true }), true);
    assert.equal(requests, before + 1, 'Enable button can retry a previously dismissed prompt');
    permissionGranted = false; canAskAgain = false;
    assert.equal(await api.ensureNotificationPermissionsAsync({ requestAgain: true }), false);
    assert.equal(requests, before + 1, 'permanent denial requires settings, not another prompt');
    console.log('Collection reminder checks passed: windows, overnight dates, catch-up, deduplication, restarts, cancellation, settings, isolation and retries.');
  } finally { Date.now = originalNow; }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
