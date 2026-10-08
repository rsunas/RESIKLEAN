/*
 * Safely import Google Earth/geojson.io route files into an existing Route.
 *
 * Usage:
 *   node src/seeds/importRouteGeoJson.js --route-name "Area 8 Collection Route" --file "C:\\path\\AREA_8.geojson"
 *   node src/seeds/importRouteGeoJson.js --route-id <id> --file "C:\\path\\route.geojson" --dry-run
 *
 * Only stops and routePath are updated. Existing assignments, schedules,
 * barangays, and active status are preserved. No routes are deleted.
 */

require('dotenv').config();
const dns = require('dns');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Route = require('../models/Route');

dns.setServers(['8.8.8.8', '1.1.1.1']);

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function asFeatures(raw) {
  if (raw?.type === 'FeatureCollection') return Array.isArray(raw.features) ? raw.features : [];
  if (raw?.type === 'Feature') return [raw];
  if (raw?.type && raw?.coordinates) return [{ type: 'Feature', properties: {}, geometry: raw }];
  return [];
}

function validCoordinate(coordinate) {
  return Array.isArray(coordinate)
    && Number.isFinite(Number(coordinate[0]))
    && Number.isFinite(Number(coordinate[1]))
    && Number(coordinate[0]) >= -180
    && Number(coordinate[0]) <= 180
    && Number(coordinate[1]) >= -90
    && Number(coordinate[1]) <= 90;
}

function lineCoordinates(geometry) {
  if (geometry?.type === 'LineString') return [geometry.coordinates];
  if (geometry?.type === 'MultiLineString') return geometry.coordinates;
  return [];
}

function readRoutePath(features) {
  const lines = features.flatMap((feature) => lineCoordinates(feature.geometry));
  if (!lines.length) return null;

  const invalidLine = lines.some((line) => !Array.isArray(line) || line.length < 2 || line.some((coordinate) => !validCoordinate(coordinate)));
  if (invalidLine) throw new Error('One or more route lines contain invalid coordinates.');

  return {
    type: lines.length === 1 ? 'LineString' : 'MultiLineString',
    coordinates: lines.length === 1 ? lines[0] : lines,
  };
}

function readStops(features) {
  const points = features
    .filter((feature) => feature?.geometry?.type === 'Point')
    .map((feature, index) => {
      const properties = feature.properties || {};
      const coordinate = feature.geometry.coordinates;
      if (!validCoordinate(coordinate)) throw new Error(`Point ${index + 1} has invalid coordinates.`);

      return {
        sourceOrder: Number.isFinite(Number(properties.kml_order)) ? Number(properties.kml_order) : index,
        name: String(properties.Name || properties.name || properties.title || `Stop ${index + 1}`).trim(),
        latitude: Number(coordinate[1]),
        longitude: Number(coordinate[0]),
        expectedTime: properties.expectedTime || properties.expected_time || undefined,
      };
    })
    .sort((first, second) => first.sourceOrder - second.sourceOrder)
    .map((stop, index) => ({
      name: stop.name,
      latitude: stop.latitude,
      longitude: stop.longitude,
      order: index + 1,
      ...(stop.expectedTime ? { expectedTime: String(stop.expectedTime) } : {}),
    }));

  if (!points.length) throw new Error('No Point features were found in the GeoJSON file.');
  return points;
}

function parseGeoJson(filePath) {
  if (!fs.existsSync(filePath)) throw new Error(`GeoJSON file not found: ${filePath}`);
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const features = asFeatures(raw);
  if (!features.length) throw new Error('GeoJSON contains no features.');

  return {
    stops: readStops(features),
    routePath: readRoutePath(features),
    sourceName: raw.name || path.basename(filePath),
  };
}

async function main() {
  const filePath = readArg('--file');
  const routeId = readArg('--route-id');
  const routeName = readArg('--route-name');
  const dryRun = process.argv.includes('--dry-run');

  if (!filePath || (!routeId && !routeName)) {
    throw new Error('Usage: --file <path> plus either --route-id <id> or --route-name "<name>".');
  }

  const imported = parseGeoJson(filePath);
  if (!imported.routePath) throw new Error('No LineString or MultiLineString route path was found.');

  console.log(`Source: ${imported.sourceName}`);
  console.log(`Stops: ${imported.stops.length}`);
  console.log(`Route path: ${imported.routePath.type}`);

  if (dryRun) {
    console.log(`First stop: ${imported.stops[0].name} (${imported.stops[0].latitude}, ${imported.stops[0].longitude})`);
    console.log('Dry run complete. No database changes were made.');
    return;
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const filter = routeId ? { _id: routeId } : { name: routeName };
  const existingRoute = await Route.findOne(filter).select('_id name stops routePath').lean();
  if (!existingRoute) throw new Error(`Target route not found: ${routeId || routeName}`);

  const updatedRoute = await Route.findOneAndUpdate(
    filter,
    { $set: { stops: imported.stops, routePath: imported.routePath } },
    { new: true, runValidators: true },
  ).lean();

  console.log(`Updated route: ${updatedRoute.name}`);
  console.log(`Route id: ${updatedRoute._id}`);
  console.log(`Replaced ${existingRoute.stops?.length || 0} old stop(s) with ${updatedRoute.stops.length} imported stop(s).`);
  await mongoose.disconnect();
}

main().catch(async (error) => {
  console.error(`Import failed: ${error.message}`);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});
