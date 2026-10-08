require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const Route = require('../src/models/Route');
const RouteLog = require('../src/models/RouteLog');
const CapacityLog = require('../src/models/CapacityLog');

async function seedCylinderMovement() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find any active route with a collector assigned
    const route = await Route.findOne({ isActive: true, collectorId: { $ne: null } }).populate('collectorId');
    if (!route) {
      console.log('No active route with a collector found.');
      process.exit(0);
    }

    const collectorId = route.collectorId._id;
    const routeId = route._id;
    console.log(`Using Route: ${route.name} and Collector: ${route.collectorId.name} (${collectorId})`);

    const eventDate = new Date().toLocaleString('en-US', { timeZone: 'Asia/Manila' }).split(',')[0].replace(/\//g, '-');
    const [month, day, year] = eventDate.split('-');
    const formattedEventDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    
    console.log(`Clearing existing seed logs for today (${formattedEventDate})...`);
    await RouteLog.deleteMany({ routeId, collectorId, eventDate: formattedEventDate, clientId: { $regex: /^seed-/ } });
    await CapacityLog.deleteMany({ routeId, driverId: collectorId, type: 'reset' });

    // Ensure there is a recent 'reset' log so cylinder starts at 0 initially (or let mobile handle it)
    await CapacityLog.create({
      routeId,
      driverId: collectorId,
      type: 'reset',
      reportedFillPct: 0
    });
    console.log('Added CapacityLog reset.');

    const args = process.argv.slice(2);
    const isOverflow = args.includes('--overflow');

    const stopsCount = isOverflow ? route.stops.length : Math.min(5, route.stops.length);
    const stops = route.stops.slice(0, stopsCount);
    console.log(`Simulating collection of ${stops.length} stops${isOverflow ? ' (--overflow enabled)' : ''}...`);
    
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const collectedAt = new Date();
      collectedAt.setMinutes(collectedAt.getMinutes() - (stops.length - i) * 10); // Spaced out by 10 mins
      const exitedAt = new Date(collectedAt.getTime() + 45000); // 45 seconds dwell
      
      await RouteLog.create({
        clientId: `seed-${Date.now()}-${i}`,
        routeId,
        collectorId,
        stopId: stop._id,
        eventDate: formattedEventDate,
        collectedAt,
        exitedAt,
        dwellSeconds: 45,
        status: 'collected',
        flaggedForReview: false
      });
      console.log(`- Stop ${i + 1}/${stops.length} collected (Stop ID: ${stop._id})`);
    }

    console.log('\nSuccess! Open the mobile app for this collector to see the cylinder fill up automatically.');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

seedCylinderMovement();
