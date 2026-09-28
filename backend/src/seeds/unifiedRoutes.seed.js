/**
 * unifiedRoutes.seed.js — Unified seed script for collection routes
 *
 * Merges THREE data sources into ONE clean database entry per area:
 *   1. GeoJSON files  → routePath (the map line for offline mobile)
 *   2. Schedule PDF #1 → schedule days + barangay names
 *   3. Schedule PDF #2 → street-level stops with expected arrival times
 *
 * Safe to re-run:
 *   - Deletes ALL existing routes and replaces with unified data.
 *   - Does NOT touch the collectionlocations collection (residents are safe).
 *
 * Usage:  node src/seeds/unifiedRoutes.seed.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Route = require('../models/Route');

const GEOJSON_DIR = path.join(__dirname, 'geojson-files');

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE DEFINITIONS — All 15 areas
// Schedule: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
//
// Street stops and expected times are from the detailed PDF schedule
// that was used to trace routes in Google Earth Pro.
//
// GeoJSON file mapping tells the script which .geojson file to read
// for each area. Areas without a geojsonFile will be created WITHOUT
// a routePath (map) — ready for when you finish tracing them.
// ══════════════════════════════════════════════════════════════════════════════

const ROUTE_DEFINITIONS = [
  // ── AREA 1 (Nightshift — Daily) ──────────────────────────────────────────
  {
    name: 'Area 1 Collection Route',
    barangay: ['Centro', 'Triangulo', 'San Francisco'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 1 GeoJSON.geojson',
    stops: [
      // Will be populated when Area 1 is traced
    ],
  },

  // ── AREA 2A ──────────────────────────────────────────────────────────────
  {
    name: 'Area 2A Collection Route',
    barangay: ['Bagumbayan Sur', 'Bagumbayan Norte', 'Calauag', 'Liboton'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 2A GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 2B ──────────────────────────────────────────────────────────────
  {
    name: 'Area 2B Collection Route',
    barangay: ['Bagumbayan Sur', 'Bagumbayan Norte', 'Calauag', 'Liboton'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 2B GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 3 ───────────────────────────────────────────────────────────────
  {
    name: 'Area 3 Collection Route',
    barangay: ['Concepcion Pequeña', 'Concepcion Grande', 'Del Rosario'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 3 GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (Concepcion Pequeña)', order: 1, expectedTime: '3:49 AM' },
      { name: 'Concepcion Pequeña', order: 2, expectedTime: '3:55 AM' },
      { name: 'Concepcion Grande', order: 3, expectedTime: '4:15 AM' },
      { name: 'Del Rosario', order: 4, expectedTime: '4:40 AM' },
      { name: 'Lerma St.', order: 5, expectedTime: '5:00 AM' },
      { name: 'San Francisco', order: 6, expectedTime: '5:20 AM' },
    ],
  },

  // ── AREA 4 (Daily) ──────────────────────────────────────────────────────
  {
    name: 'Area 4 Collection Route',
    barangay: ['Dayangdang', 'Tinago'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 4 GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 5 (Daily) ──────────────────────────────────────────────────────
  {
    name: 'Area 5 Collection Route',
    barangay: ['Abella', 'Sta. Cruz', 'Peñafrancia'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 5 Daily GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (Abella)', order: 1, expectedTime: '4:00 AM' },
      { name: 'Abella', order: 2, expectedTime: '4:10 AM' },
      { name: 'Sta. Cruz', order: 3, expectedTime: '4:30 AM' },
      { name: 'Peñafrancia', order: 4, expectedTime: '4:50 AM' },
    ],
  },

  // ── AREA 6 (Daily) ──────────────────────────────────────────────────────
  {
    name: 'Area 6 Collection Route',
    barangay: ['Dinaga'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 6 Daily GeoJSON.geojson',
    stops: [
      { name: "Starting Point (Naga City People's Mall)", order: 1, expectedTime: '5:00 AM' },
      { name: "Naga City People's Mall", order: 2, expectedTime: '5:10 AM' },
      { name: 'Dinaga', order: 3, expectedTime: '5:30 AM' },
    ],
  },

  // ── AREA 7 ───────────────────────────────────────────────────────────────
  {
    name: 'Area 7 Collection Route',
    barangay: ['Mabolo', 'Tabuco', 'Lerma'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 7 GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (Mabolo)', order: 1, expectedTime: '5:00 AM' },
      { name: 'Mabolo', order: 2, expectedTime: '5:10 AM' },
      { name: 'Tabuco', order: 3, expectedTime: '5:30 AM' },
      { name: 'Lerma', order: 4, expectedTime: '5:50 AM' },
    ],
  },

  // ── AREA 8 ───────────────────────────────────────────────────────────────
  {
    name: 'Area 8 Collection Route',
    barangay: ['Panicuason', 'Carolina', 'Pacol', 'San Isidro'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 8 GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 9 ───────────────────────────────────────────────────────────────
  {
    name: 'Area 9 Collection Route',
    barangay: ['Balatas', 'Cararayan'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 9 GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 10 ──────────────────────────────────────────────────────────────
  {
    name: 'Area 10 Collection Route',
    barangay: ['San Felipe'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 10 GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (San Felipe)', order: 1, expectedTime: '5:00 AM' },
      { name: 'San Felipe', order: 2, expectedTime: '5:15 AM' },
    ],
  },

  // ── AREA 11 ──────────────────────────────────────────────────────────────
  {
    name: 'Area 11 Collection Route',
    barangay: ['C.C.A.T. - South'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 11 GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 12 ──────────────────────────────────────────────────────────────
  {
    name: 'Area 12 Collection Route',
    barangay: ['Naga City Subdivision', 'Sabella', 'Northfield', 'Villa Obiedo'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 12 GeoJSON.geojson',
    stops: [],
  },

  // ── AREA 13 (Mainline — Nightshift) ──────────────────────────────────────
  {
    name: 'Area 13 Collection Route',
    barangay: ['Concepcion Pequeña', 'Del Rosario', 'Dayangdang', 'Peñafrancia', 'Liboton', 'Bagumbayan Sur', 'Bagumbayan Norte'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 13 GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (Diversion Road)', order: 1, expectedTime: '6:00 PM' },
      { name: 'Concepcion Pequeña to Del Rosario', order: 2, expectedTime: '6:20 PM' },
      { name: 'Panganiban to Rotonda left to Magsaysay Ave.', order: 3, expectedTime: '6:45 PM' },
      { name: 'Right to Colgante', order: 4, expectedTime: '7:00 PM' },
      { name: 'Right to Peñafrancia', order: 5, expectedTime: '7:15 PM' },
      { name: 'Left to Liboton', order: 6, expectedTime: '7:30 PM' },
      { name: 'Left to Bagumbayan Sur', order: 7, expectedTime: '7:45 PM' },
      { name: 'U-turn to Bagumbayan Norte', order: 8, expectedTime: '8:00 PM' },
      { name: 'Back to Bagumbayan Sur', order: 9, expectedTime: '8:15 PM' },
      { name: 'Left to Liboton (Route 2)', order: 10, expectedTime: '8:30 PM' },
      { name: 'Balatas Road - SLF', order: 11, expectedTime: '9:00 PM' },
    ],
  },

  // ── AREA 15 (Subdivision Only) ───────────────────────────────────────────
  {
    name: 'Area 15 Collection Route',
    barangay: ['Villa Grande Homes', 'St. Andrew', 'St. James', 'St. Jude', 'Monte Cielo', 'Camella Homes', 'Doña Conchita Subdivision', 'Executive Townhomes', 'Parkview Subdivision', 'Urban Residences'],
    schedule: [0, 1, 2, 3, 4, 5, 6], // Daily (Sun-Sat)
    geojsonFile: 'Area 15 GeoJSON.geojson',
    stops: [
      { name: 'Starting Point (R.F. Pula Market)', order: 1, expectedTime: '7:00 AM' },
      { name: 'Villa Grande Homes', order: 2, expectedTime: '7:15 AM' },
      { name: 'St. Andrew', order: 3, expectedTime: '7:30 AM' },
      { name: 'St. James', order: 4, expectedTime: '7:45 AM' },
      { name: 'St. Jude', order: 5, expectedTime: '8:00 AM' },
      { name: 'Monte Cielo', order: 6, expectedTime: '8:15 AM' },
      { name: 'Camella Homes', order: 7, expectedTime: '8:30 AM' },
      { name: 'Doña Conchita Subdivision', order: 8, expectedTime: '8:45 AM' },
      { name: 'Executive Townhomes', order: 9, expectedTime: '9:00 AM' },
      { name: 'Parkview Subdivision', order: 10, expectedTime: '9:15 AM' },
      { name: 'Urban Residences', order: 11, expectedTime: '9:30 AM' },
    ],
  },
];

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Read a GeoJSON file and extract the routePath
// ══════════════════════════════════════════════════════════════════════════════
function readGeoJSON(filename) {
  const filePath = path.join(GEOJSON_DIR, filename);

  if (!fs.existsSync(filePath)) {
    console.log('   ⚠️  GeoJSON file not found: ' + filename);
    return null;
  }

  const raw = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  let lineFeatures = [];

  if (raw.type === 'FeatureCollection') {
    lineFeatures = raw.features.filter(
      (f) =>
        f.geometry &&
        (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
    );
  } else if (raw.type === 'Feature' && raw.geometry) {
    if (raw.geometry.type === 'LineString' || raw.geometry.type === 'MultiLineString') {
      lineFeatures = [raw];
    }
  } else if (raw.type === 'LineString' || raw.type === 'MultiLineString') {
    lineFeatures = [{ geometry: raw }];
  }

  if (lineFeatures.length === 0) return null;

  if (lineFeatures.length === 1) {
    return {
      type: lineFeatures[0].geometry.type,
      coordinates: lineFeatures[0].geometry.coordinates,
    };
  }

  // Multiple paths → merge into MultiLineString
  const allCoords = lineFeatures
    .map((f) => {
      if (f.geometry.type === 'MultiLineString') return f.geometry.coordinates;
      return [f.geometry.coordinates];
    })
    .flat();

  return { type: 'MultiLineString', coordinates: allCoords };
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');

  // ── Step 1: Delete ALL existing routes ──────────────────────────────────
  const deleted = await Route.deleteMany({});
  console.log('🗑️  Deleted ' + deleted.deletedCount + ' old route(s)\n');

  // ── Step 2: Insert unified routes ───────────────────────────────────────
  let withMap = 0;
  let withoutMap = 0;

  for (const def of ROUTE_DEFINITIONS) {
    const routeData = {
      name: def.name,
      barangay: def.barangay,
      schedule: def.schedule,
      stops: def.stops,
      isActive: true,
    };

    // Attach GeoJSON map if available
    if (def.geojsonFile) {
      const routePath = readGeoJSON(def.geojsonFile);
      if (routePath) {
        routeData.routePath = routePath;
        withMap++;
        console.log('   ✅ ' + def.name + ' — with map (' + routePath.type + ') + ' + def.stops.length + ' stops');
      } else {
        withoutMap++;
        console.log('   ⚠️  ' + def.name + ' — map file not found, created without map');
      }
    } else {
      withoutMap++;
      console.log('   📋 ' + def.name + ' — no map yet (awaiting Google Earth trace)');
    }

    await Route.create(routeData);
  }

  // ── Step 3: Summary ─────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════');
  console.log('   Total routes created: ' + ROUTE_DEFINITIONS.length);
  console.log('   With map:            ' + withMap);
  console.log('   Awaiting map:        ' + withoutMap);
  console.log('══════════════════════════════════════════\n');

  await mongoose.disconnect();
  console.log('🔌 Disconnected from MongoDB');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
