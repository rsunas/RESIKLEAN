const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
require('dotenv').config();

const Route = require('../src/models/Route');

const GEOJSON_DIR = path.join(__dirname, '../src/seeds/geojson-files');
const BACKUP_DIR = path.join(__dirname, '../src/seeds/backups');

async function importGeoJSON(dryRun = true) {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log(`Connected to MongoDB. Dry run: ${dryRun}`);

    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const files = fs.readdirSync(GEOJSON_DIR).filter(f => f.endsWith('.geojson'));

    for (const file of files) {
      console.log(`\n--- Processing ${file} ---`);
      let normalized = file.replace(/geojson/i, '').replace(/daily/i, '').replace(/nightshift/i, '');
      normalized = normalized.replace(/[_\-–]/g, ' ').replace(/\s+/g, ' ');
      const match = normalized.match(/Area\s+([0-9]+\s*[a-zA-Z]?)/i);
      if (!match) {
        console.warn(`Could not extract area name from filename: ${file}`);
        continue;
      }

      const areaKey = match[1].replace(/\s/g, '').toUpperCase();
      const targetRouteName = `Area ${areaKey} Collection Route`;

      const route = await Route.findOne({ name: targetRouteName });
      if (!route) {
        console.warn(`Route not found in DB for: ${targetRouteName}`);
        continue;
      }

      // Read file
      const rawData = fs.readFileSync(path.join(GEOJSON_DIR, file), 'utf-8');
      const geojson = JSON.parse(rawData);

      if (!geojson.features || !Array.isArray(geojson.features)) {
        console.warn(`Invalid GeoJSON format in ${file}`);
        continue;
      }

      const points = [];
      const lines = [];
      let invalidCoordinates = 0;

      geojson.features.forEach((feature) => {
        if (!feature.geometry || !feature.geometry.coordinates) return;

        if (feature.geometry.type === 'Point') {
          const coords = feature.geometry.coordinates;
          if (
            coords.length >= 2 &&
            coords[1] >= -90 && coords[1] <= 90 &&
            coords[0] >= -180 && coords[0] <= 180
          ) {
            points.push(feature);
          } else {
            invalidCoordinates++;
          }
        } else if (feature.geometry.type === 'LineString') {
          lines.push(feature.geometry.coordinates);
        } else if (feature.geometry.type === 'MultiLineString') {
          feature.geometry.coordinates.forEach(line => lines.push(line));
        }
      });

      const stops = points.map((p, index) => {
        const name = p.properties?.Name || p.properties?.name || `Stop ${index + 1}`;
        return {
          name: name,
          latitude: p.geometry.coordinates[1],
          longitude: p.geometry.coordinates[0],
          order: index + 1
        };
      });

      const routePath = {
        type: 'MultiLineString',
        coordinates: lines
      };

      console.log(`Target route: ${targetRouteName}`);
      console.log(`Number of points (stops): ${stops.length}`);
      console.log(`Number of route lines: ${lines.length}`);
      if (invalidCoordinates > 0) {
        console.warn(`Invalid coordinates skipped: ${invalidCoordinates}`);
      }

      if (!dryRun) {
        // Backup
        fs.writeFileSync(
          path.join(BACKUP_DIR, `backup_${route._id}_${Date.now()}.json`),
          JSON.stringify(route.toObject(), null, 2)
        );

        await Route.findByIdAndUpdate(route._id, { stops, routePath });
        console.log(`Successfully updated ${targetRouteName}`);
      }
    }

    if (!dryRun) {
      // Remove temporary test route
      const tempRouteName = 'Area 1 Nightshift - GeoJSON Pin Test';
      const deleted = await Route.deleteOne({ name: tempRouteName });
      if (deleted.deletedCount > 0) {
        console.log(`\nRemoved temporary route: ${tempRouteName}`);
      } else {
        console.log(`\nTemporary route not found: ${tempRouteName}`);
      }
    }

  } catch (error) {
    console.error('Error during import:', error);
  } finally {
    mongoose.disconnect();
    console.log('\nFinished.');
  }
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
importGeoJSON(isDryRun);
