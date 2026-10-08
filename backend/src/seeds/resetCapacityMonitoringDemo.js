require('dotenv').config();

const mongoose = require('mongoose');
const CapacityLog = require('../models/CapacityLog');
const RouteLog = require('../models/RouteLog');

const SEED_PREFIX = '^seed-capacity-';

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
  await mongoose.connect(process.env.MONGODB_URI);
  const [capacity, route] = await Promise.all([
    CapacityLog.deleteMany({ clientId: { $regex: SEED_PREFIX } }),
    RouteLog.deleteMany({ clientId: { $regex: SEED_PREFIX } }),
  ]);
  console.log(`Removed ${capacity.deletedCount} seeded CapacityLogs and ${route.deletedCount} seeded RouteLogs.`);
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());

