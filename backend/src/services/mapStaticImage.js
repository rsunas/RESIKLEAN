const axios = require('axios');

const MAPBOX_TOKEN = process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';

function simplifyCoordinates(coords, minDistanceMeters = 5) {
  if (!Array.isArray(coords) || coords.length <= 2) return coords;
  const out = [coords[0]];
  const R = 6371000;
  const rad = (v) => v * Math.PI / 180;
  const dist = (a, b) => {
    const dLat = rad(b[1] - a[1]);
    const dLon = rad(b[0] - a[0]);
    const lat1 = rad(a[1]);
    const lat2 = rad(b[1]);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  };
  for (let i = 1; i < coords.length; i += 1) {
    if (dist(out[out.length - 1], coords[i]) >= minDistanceMeters) {
      out.push(coords[i]);
    }
  }
  const last = coords[coords.length - 1];
  if (last && (out[out.length - 1][0] !== last[0] || out[out.length - 1][1] !== last[1])) {
    out.push(last);
  }
  return out;
}

function lineToGeoJSONFeature(coordinates, color, width, dashPattern) {
  return {
    type: 'Feature',
    properties: dashPattern ? { stroke: color, 'stroke-width': width, 'stroke-dasharray': dashPattern } : { stroke: color, 'stroke-width': width },
    geometry: { type: 'LineString', coordinates },
  };
}

function pointFeature(coord, color, size, label) {
  const [lon, lat] = Array.isArray(coord) ? coord : [];
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return {
    type: 'Feature',
    properties: label ? { 'marker-color': color, 'marker-size': size === 'large' ? 'large' : 'medium', title: label } : { 'marker-color': color, 'marker-size': size === 'large' ? 'large' : 'medium' },
    geometry: { type: 'Point', coordinates: [lon, lat] },
  };
}

async function getMapboxStaticImage({ coveredCoords, expectedCoords, entryCoord, exitCoord, bounds, width = 600, height = 360 }) {
  if (!MAPBOX_TOKEN) throw new Error('MAPBOX_TOKEN_MISSING');
  const overlays = [];
  if (Array.isArray(coveredCoords) && coveredCoords.length >= 2) {
    const simplified = simplifyCoordinates(coveredCoords, 8);
    overlays.push(lineToGeoJSONFeature(simplified, '#d42f54', 4));
  }
  if (Array.isArray(expectedCoords) && expectedCoords.length >= 2) {
    const simplified = simplifyCoordinates(expectedCoords, 8);
    overlays.push(lineToGeoJSONFeature(simplified, '#d42f54', 3, '4,4'));
  }
  if (entryCoord && entryCoord.length === 2) {
    const feature = pointFeature(entryCoord, '#d42f54', 'large', 'Entry');
    if (feature) overlays.push(feature);
  }
  if (exitCoord && exitCoord.length === 2) {
    const feature = pointFeature(exitCoord, '#707070', 'large', 'Exit');
    if (feature) overlays.push(feature);
  }
  const overlay = encodeURIComponent(JSON.stringify({ type: 'FeatureCollection', features: overlays }));
  let location = bounds && bounds.length === 4
    ? `[${bounds[0]},${bounds[1]},${bounds[2]},${bounds[3]}]`
    : 'auto';
  const safeWidth = Math.max(200, Math.round(Number(width) || 600));
  const safeHeight = Math.max(160, Math.round(Number(height) || 360));
  const url = `https://api.mapbox.com/styles/v1/mapbox/light-v11/static/geojson(${overlay})/${location}/${safeWidth}x${safeHeight}?access_token=${MAPBOX_TOKEN}`;
  const response = await axios.get(url, { responseType: 'arraybuffer', timeout: 12000 });
  if (response.status !== 200 || !response.data) throw new Error(`Mapbox returned HTTP ${response.status}`);
  return Buffer.from(response.data, 'binary');
}

function computeBounds(coordsList) {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  coordsList.forEach((coords) => {
    if (!Array.isArray(coords)) return;
    coords.forEach(([lng, lat]) => {
      if (Number.isFinite(lng) && Number.isFinite(lat)) {
        if (lng < minLng) minLng = lng;
        if (lat < minLat) minLat = lat;
        if (lng > maxLng) maxLng = lng;
        if (lat > maxLat) maxLat = lat;
      }
    });
  });
  if (!Number.isFinite(minLng)) return null;
  const padLng = Math.max(0.002, (maxLng - minLng) * 0.2);
  const padLat = Math.max(0.002, (maxLat - minLat) * 0.2);
  return [minLng - padLng, minLat - padLat, maxLng + padLng, maxLat + padLat];
}

async function getSegmentTrailImage(input = {}) {
  const { coveredCoordinates, expectedCoordinates, entryCoord, exitCoord, width, height } = input;
  const bounds = computeBounds([coveredCoordinates, expectedCoordinates]);
  try {
    return await getMapboxStaticImage({
      coveredCoords: coveredCoordinates,
      expectedCoords: expectedCoordinates,
      entryCoord,
      exitCoord,
      bounds,
      width,
      height,
    });
  } catch (err) {
    if (err.message === 'MAPBOX_TOKEN_MISSING' || /Mapbox|timeout|network|axios/i.test(err.message || '')) {
      return null;
    }
    throw err;
  }
}

module.exports = {
  getSegmentTrailImage,
  simplifyCoordinates,
  computeBounds,
};
