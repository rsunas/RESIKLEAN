const axios = require('axios');
const { trailMapViewport } = require('./trailMapViewport');

// Only the basemap travels over HTTP: a GeoJSON URL containing a whole trip
// can exceed the Static Images API URL limit. The PDF draws every point locally.
async function getSegmentTrailImage(input = {}) {
  const token = process.env.MAPBOX_PUBLIC_TOKEN || process.env.MAPBOX_ACCESS_TOKEN || '';
  const view = trailMapViewport(input);
  if (!token || !view) return null;
  const { longitude, latitude, zoom, width, height } = view;
  const url = 'https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/'
    + longitude + ',' + latitude + ',' + zoom + ',0,0/' + width + 'x' + height + '@2x';
  try {
    const response = await axios.get(url, {
      params: { access_token: token }, responseType: 'arraybuffer', timeout: 12000,
    });
    return response.status === 200 && response.data ? Buffer.from(response.data) : null;
  } catch {
    // Keep the coordinate diagram usable; never log a token-bearing URL.
    return null;
  }
}
module.exports = { getSegmentTrailImage };
