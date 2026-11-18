const { windowFor, dayKey, buildOccurrences, coverage, frequent } = require('../src/services/overviewMetrics');
const today = '2026-11-18';
const stops = [{ _id: 'one', name: 'Original street' }, { _id: 'two', name: 'Second street' }];
const route = { _id: 'route', name: 'Original route', barangay: ['Original area'], stops, isActive: true, collectorId: 'driver', schedule: [0, 1, 2, 3, 4, 5, 6], createdAt: '2026-01-01', updatedAt: '2026-01-01' };
const session = { routeId: 'route', startedAt: '2026-11-18T00:00:00Z', routeName: route.name, routeSnapshot: { name: route.name, barangay: route.barangay, stops }, createdAt: '2026-11-18T00:01:00Z' };
const log = { routeId: 'route', stopId: 'one', collectedAt: '2026-11-18T00:01:00Z', createdAt: '2026-11-18T00:04:00Z' };
const build = overrides => buildOccurrences({ routes: [route], sessions: [], logs: [], days: [today], today, ...overrides });

test('ranges roll over at Manila midnight, including month and year boundaries', () => {
  expect(dayKey('2026-11-17T16:00:00Z')).toBe(today);
  expect(windowFor('today', new Date('2026-11-17T16:00:00Z')).from.toISOString()).toBe('2026-11-17T16:00:00.000Z');
  expect(windowFor('7d', new Date('2027-01-01T00:00:00Z')).days).toHaveLength(7);
  expect(windowFor('7d', new Date('2027-01-01T00:00:00Z')).start).toBe('2026-12-26');
  expect(windowFor('month', new Date('2026-11-18T00:00:00Z')).days).toHaveLength(18);
});

test('duplicate uploads and replacement drivers count once per route, stop and date', () => {
  const data = build({ sessions: [session, { ...session, collectorId: 'replacement' }], logs: [log, { ...log, collectorId: 'replacement' }] });
  expect(coverage(data)).toMatchObject({ scheduled: 2, completed: 1, remaining: 1, rate: 50 });
  expect(data.logs).toHaveLength(1);
  expect(data.lastSyncedAt).toBe('2026-11-18T00:04:00.000Z');
});

test('same stop on two calendar days is two scheduled visits and two completions', () => {
  const data = build({ days: ['2026-11-17', today], logs: [log, { ...log, collectedAt: '2026-11-17T00:01:00Z' }] });
  expect(coverage(data)).toMatchObject({ scheduled: 4, completed: 2, remaining: 2, rate: 50 });
});

test('live pending stops are not missed; ending GPS alone does not close the route', () => {
  expect(frequent(build({ sessions: [{ ...session, status: 'completed' }], logs: [log] }))).toEqual([]);
  expect(frequent(build({ sessions: [{ ...session, routeCompletedAt: '2026-11-18T04:00:00Z' }], logs: [log] }))).toEqual([expect.objectContaining({ name: 'Second street', missed: 1 })]);
});

test('past collection days close and late offline completion removes the missed count', () => {
  const previous = { ...session, startedAt: '2026-11-17T00:00:00Z' };
  expect(frequent(build({ sessions: [previous], days: ['2026-11-17'] }))).toHaveLength(2);
  const data = build({ sessions: [previous], days: ['2026-11-17'], logs: [{ ...log, collectedAt: '2026-11-17T00:01:00Z' }] });
  expect(frequent(data)).toHaveLength(1);
});

test('snapshot names and stops survive reassignment, rename, archival and area filtering', () => {
  const changed = { ...route, name: 'New route', barangay: ['New area'], stops: [{ _id: 'new', name: 'New stop' }], isActive: false, collectorId: null, updatedAt: '2026-11-18' };
  const data = build({ routes: [changed], sessions: [session], logs: [log], area: 'Original area' });
  expect(coverage(data)).toMatchObject({ scheduled: 2, completed: 1, routes: [expect.objectContaining({ name: 'Original route' })] });
  expect(build({ routes: [changed], sessions: [session], area: 'New area' }).rows).toEqual([]);
});

test('lost historical schedule is partial, not backfilled with current assignments', () => {
  const data = build({ routes: [{ ...route, updatedAt: '2026-11-18' }], days: ['2026-11-17'] });
  expect(data.incomplete).toBe(true);
  expect(coverage(data)).toMatchObject({ scheduled: 0, rate: null });
  expect(frequent(data)).toEqual([]);
});

test('legacy trip changed later the same day cannot borrow the new route stops', () => {
  const data = build({ routes: [{ ...route, updatedAt: '2026-11-18T06:00:00Z' }], sessions: [{ ...session, routeSnapshot: undefined }], days: [today], logs: [log] });
  expect(data.incomplete).toBe(true);
  expect(coverage(data).scheduled).toBe(0);
  expect(coverage(data).routes[0].rate).toBeNull();
});

test('unmatched logged stops retain hourly evidence but do not fabricate a denominator', () => {
  const data = build({ logs: [{ ...log, stopId: 'lost-stop' }] });
  expect(data.logs).toHaveLength(1);
  expect(coverage(data)).toMatchObject({ scheduled: 2, completed: 1, unmatchedCompletions: 1, rate: null });
});

test('empty schedules, unassigned routes and archived stops do not inflate counts', () => {
  expect(coverage(build({ routes: [{ ...route, schedule: [] }] })).scheduled).toBe(0);
  expect(coverage(build({ routes: [{ ...route, collectorId: null }] })).scheduled).toBe(0);
  expect(coverage(build({ routes: [{ ...route, stops: [...stops, { _id: 'archived', isArchived: true }] }] })).scheduled).toBe(2);
});

test('no uploaded records means no sync timestamp, not the server request time', () => {
  expect(build().lastSyncedAt).toBeNull();
});
