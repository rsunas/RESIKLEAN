/**
 * seed-routes.js
 * ──────────────────────────────────────────────────────────────────────────────
 * One-time script to populate the Route collection with the official
 * Naga City Solid Waste Management Office area/barangay data.
 *
 * Usage:  node scripts/seed-routes.js
 * ──────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const mongoose = require('mongoose');
const Route = require('../src/models/Route');

// ── Official Naga City Areas (from the SWMO Collection Schedule PDF) ─────────
const AREAS = [
  {
    name: 'Area 1 Collection Route',
    barangay: 'Area 1 (Nightshift)',
    schedule: [1, 2, 3, 4, 5, 6], // Mon–Sat nightshift
  },
  {
    name: 'Area 2A Collection Route',
    barangay: 'Area 2 A',
    schedule: [1, 3, 5], // Mon, Wed, Fri
  },
  {
    name: 'Area 2B Collection Route',
    barangay: 'Area 2 B',
    schedule: [2, 4, 6], // Tue, Thu, Sat
  },
  {
    name: 'Area 3 Collection Route',
    barangay: 'Area 3',
    schedule: [1, 3, 5],
  },
  {
    name: 'Area 4 Collection Route',
    barangay: 'Area 4 (Daily)',
    schedule: [1, 2, 3, 4, 5, 6],
  },
  {
    name: 'Area 5 Collection Route',
    barangay: 'Area 5 (Daily)',
    schedule: [1, 2, 3, 4, 5, 6],
  },
  {
    name: 'Area 6 Collection Route',
    barangay: 'Area 6 (Daily)',
    schedule: [1, 2, 3, 4, 5, 6],
  },
  {
    name: 'Area 7 Collection Route',
    barangay: 'Area 7',
    schedule: [1, 3, 5],
  },
  {
    name: 'Area 8 Collection Route',
    barangay: 'Area 8',
    schedule: [2, 4, 6],
  },
  {
    name: 'Area 9 Collection Route',
    barangay: 'Area 9',
    schedule: [1, 3, 5],
  },
  {
    name: 'Area 10 Collection Route',
    barangay: 'Area 10',
    schedule: [2, 4, 6],
  },
  {
    name: 'Area 11 Collection Route',
    barangay: 'Area 11 (C.C.A.T. - South)',
    schedule: [1, 3, 5],
  },
  {
    name: 'Area 12 Collection Route',
    barangay: 'Area 12',
    schedule: [2, 4, 6],
  },
  {
    name: 'Area 13 Collection Route',
    barangay: 'Area 13 (Mainline Only)',
    schedule: [1, 3, 5],
  },
  {
    name: 'Area 15 Collection Route',
    barangay: 'Area 15 (Subdivision Only)',
    schedule: [2, 4, 6],
  },
];

async function seed() {
  try {
    console.log('🔗 Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected!\n');

    // Check if routes already exist
    const existingCount = await Route.countDocuments();
    if (existingCount > 0) {
      console.log(`⚠️  Found ${existingCount} existing route(s) in the database.`);
      console.log('   Skipping seed to avoid duplicates.');
      console.log('   To re-seed, manually clear the routes collection first.\n');
      await mongoose.disconnect();
      return;
    }

    // Insert all areas
    const created = await Route.insertMany(
      AREAS.map((area) => ({
        ...area,
        stops: [],       // Empty stops for now — Admin can fill these in later
        isActive: true,
      }))
    );

    console.log(`🌱 Successfully seeded ${created.length} routes:\n`);
    created.forEach((r) => {
      console.log(`   ✅ ${r.barangay}`);
    });

    console.log('\n🎉 Done! The Staff dropdown will now show all Naga City areas.');
    await mongoose.disconnect();
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
