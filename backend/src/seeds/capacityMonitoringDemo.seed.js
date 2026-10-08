require('dotenv').config();

const mongoose = require('mongoose');
const CapacityLog = require('../models/CapacityLog');
const DailyCycleLog = require('../models/DailyCycleLog');
const Route = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const { DENSITY_TONNES_PER_M3 } = require('../utils/capacityProjection');

const SEED_PREFIX = 'seed-capacity-';

function estimatedLoad(capacity, fillLevelPct) {
  const estimatedVolumeM3 = Number((capacity * (fillLevelPct / 100)).toFixed(3));
  return {
    estimatedVolumeM3,
    estimatedTonnage: Number((estimatedVolumeM3 * DENSITY_TONNES_PER_M3).toFixed(3)),
  };
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);

  const cycles = await DailyCycleLog.find({ shiftStatus: 'active' })
    .populate('truckId')
    .sort({ shiftStart: -1 })
    .lean();
  const driverIds = cycles.map((cycle) => cycle.driverId);
  const route = await Route.findOne({
    collectorId: { $in: driverIds },
    isActive: true,
    name: /^Area (7|13) Collection Route$/,
  }).lean();
  if (!route || route.stops.length < 4) {
    throw new Error('An active Area 7 or Area 13 route with at least four stops is required.');
  }

  const cycle = cycles.find((candidate) => String(candidate.driverId) === String(route.collectorId));
  if (!cycle?.truckId) throw new Error('The selected route driver has no active truck cycle.');

  const now = Date.now();
  const firstLogAt = now - route.stops.length * 2 * 60 * 1000;
  if (new Date(cycle.shiftStart).getTime() >= firstLogAt) {
    throw new Error('The active shift is too new for the demo timeline. Wait a few minutes and run again.');
  }

  // The script is safe to re-run and cleans up only its own seed records.
  await Promise.all([
    CapacityLog.deleteMany({ clientId: { $regex: `^${SEED_PREFIX}` } }),
    RouteLog.deleteMany({ clientId: { $regex: `^${SEED_PREFIX}` } }),
  ]);

  const eventDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(now));
  const routeLogs = route.stops.map((stop, index) => {
    const collectedAt = new Date(firstLogAt + index * 2 * 60 * 1000);
    return {
      clientId: `${SEED_PREFIX}route-${route._id}-${stop._id}`,
      routeId: route._id,
      collectorId: cycle.driverId,
      stopId: stop._id,
      eventDate,
      collectedAt,
      exitedAt: new Date(collectedAt.getTime() + 60 * 1000),
      dwellSeconds: 60,
      status: 'collected',
    };
  });
  await RouteLog.insertMany(routeLogs);

  const capacity = Number(cycle.truckId.length) * Number(cycle.truckId.width) * Number(cycle.truckId.height);
  const overflowStops = 3;
  const overflowFillLevelPct = 80;
  const fitFillLevelPct = 60;
  const overflowAt = new Date(routeLogs[overflowStops - 1].exitedAt.getTime() + 30 * 1000);
  const fitAt = new Date(routeLogs.at(-1).exitedAt.getTime() + 30 * 1000);

  await CapacityLog.insertMany([
    {
      clientId: `${SEED_PREFIX}overflow-${cycle._id}`,
      driverId: cycle.driverId,
      truckId: cycle.truckId._id,
      cycleLogId: cycle._id,
      routeId: route._id,
      fillLevelPct: overflowFillLevelPct,
      stopsCompleted: overflowStops,
      totalStops: route.stops.length,
      ...estimatedLoad(capacity, overflowFillLevelPct),
      loggedAt: overflowAt,
      dataSource: 'seed',
    },
    {
      clientId: `${SEED_PREFIX}fit-${cycle._id}`,
      driverId: cycle.driverId,
      truckId: cycle.truckId._id,
      cycleLogId: cycle._id,
      routeId: route._id,
      fillLevelPct: fitFillLevelPct,
      stopsCompleted: route.stops.length,
      totalStops: route.stops.length,
      ...estimatedLoad(capacity, fitFillLevelPct),
      loggedAt: fitAt,
      dataSource: 'seed',
    },
  ]);

  console.log(`Seeded ${routeLogs.length} RouteLogs and two CapacityLogs for ${route.name}.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

