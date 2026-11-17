const Route = require('../src/models/Route');
const RouteLog = require('../src/models/RouteLog');
const Cycle = require('../src/models/DailyCycleLog');
const CapacityLog = require('../src/models/CapacityLog');
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
const { batchSyncCapacity } = require('../src/controllers/collector.controller');
const { DENSITY_TONNES_PER_M3 } = require('../src/utils/capacityProjection');
const chain = data => {
  const query = {};
  for (const method of ['select', 'sort', 'populate']) query[method] = () => query;
  query.lean = async () => data;
  return query;
};
const context = { cycleLogId: 'cycle', truckId: 'truck', routeId: 'route' };
const reset = { ...context, clientId: 'reset-1', type: 'reset', fillLevelPct: 0, loggedAt: '2026-11-18T02:00:00Z' };
beforeEach(() => {
  jest.spyOn(Cycle, 'findOne').mockReturnValue(chain({ _id: 'cycle', shiftStart: new Date('2026-11-18T00:00:00Z'), truckId: { _id: 'truck', length: 5, width: 2, height: 1 } }));
  jest.spyOn(Route, 'findOne').mockReturnValue(chain({ _id: 'route', stops: [{}, {}] }));
  jest.spyOn(RouteLog, 'countDocuments').mockResolvedValue(2);
  jest.spyOn(CapacityLog, 'find').mockReturnValue(chain([]));
  jest.spyOn(CapacityLog, 'create').mockImplementation(async record => {
    const error = new CapacityLog({ estimatedTonnage: record.estimatedTonnage }).validateSync()?.errors.estimatedTonnage;
    if (error) throw error;
    return record;
  });
});
afterEach(() => jest.restoreAllMocks());
async function submit(logs) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  await batchSyncCapacity({ user: { _id: 'driver' }, body: { logs } }, res);
  return res.json.mock.calls[0][0];
}
test('reset persists finite zero tonnage (regression for missing density export)', async () => {
  expect(DENSITY_TONNES_PER_M3).toBe(0.294);
  const result = await submit([reset]);
  expect(result.data.syncedIds).toEqual(['reset-1']);
  expect(CapacityLog.create).toHaveBeenCalledWith(expect.objectContaining({ estimatedTonnage: 0, estimatedVolumeM3: 0, fillLevelPct: 0 }));
});
test('normal fill uses truck dimensions and density', async () => {
  await submit([{ ...reset, type: 'log', fillLevelPct: 50 }]);
  expect(CapacityLog.create).toHaveBeenCalledWith(expect.objectContaining({ estimatedVolumeM3: 5, estimatedTonnage: 1.47 }));
});
test.each(['cycleLogId', 'truckId', 'routeId'])('rejects stale %s without applying it to the current assignment', async field => {
  const result = await submit([{ ...reset, [field]: 'old' }]);
  expect(result.data.syncedIds).toEqual([]);
  expect(result.data.failed).toHaveLength(1);
  expect(CapacityLog.create).not.toHaveBeenCalled();
});
test('partial failure acknowledges only the saved reset', async () => {
  CapacityLog.create.mockRejectedValueOnce(new Error('database unavailable'));
  const result = await submit([reset, { ...reset, clientId: 'reset-2' }]);
  expect(result.data.syncedIds).toEqual(['reset-2']);
  expect(result.data.failed[0].clientId).toBe('reset-1');
});
test('retry deduplicates only this driver records', async () => {
  CapacityLog.find.mockReturnValue(chain([{ clientId: reset.clientId }]));
  const result = await submit([reset]);
  expect(CapacityLog.find).toHaveBeenCalledWith(expect.objectContaining({ driverId: 'driver' }));
  expect(result.data.syncedIds).toEqual([reset.clientId]);
  expect(CapacityLog.create).not.toHaveBeenCalled();
});
