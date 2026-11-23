jest.mock('axios', () => ({ get: jest.fn() }));
const axios = require('axios');
const { getSegmentTrailImage } = require('../src/services/mapStaticImage');
const { trailMapViewport } = require('../src/services/trailMapViewport');
const original = process.env.MAPBOX_ACCESS_TOKEN, publicToken = process.env.MAPBOX_PUBLIC_TOKEN;
beforeEach(() => { axios.get.mockReset(); delete process.env.MAPBOX_PUBLIC_TOKEN; process.env.MAPBOX_ACCESS_TOKEN = 'fixture'; });
afterAll(() => {
  if (original === undefined) delete process.env.MAPBOX_ACCESS_TOKEN; else process.env.MAPBOX_ACCESS_TOKEN = original;
  if (publicToken !== undefined) process.env.MAPBOX_PUBLIC_TOKEN = publicToken;
});
const lines = [Array.from({ length: 6000 }, (_, i) => [123.18 + i / 1000000, 13.62 + Math.sin(i / 1000) / 100]), [[123.21,13.66],[123.22,13.67]]];
test('long multi-trip trails use a short basemap URL instead of a GeoJSON overlay', async () => {
  axios.get.mockResolvedValue({ status: 200, data: Buffer.from('image') });
  const result = await getSegmentTrailImage({ coveredSegments: lines, width: 780, height: 450 });
  expect(result).toEqual(Buffer.from('image'));
  const [url, options] = axios.get.mock.calls[0];
  expect(url.length).toBeLessThan(250);
  expect(url).not.toContain('geojson');
  expect(url).toContain('streets-v12/static/');
  expect(options.params.access_token).toBe('fixture');
});
test('camera contains every trip, stop, and final GPS point with no coordinate simplification', () => {
  const stops = [[123.16,13.60]];
  const view = trailMapViewport({ coveredSegments: lines, stopCoordinates: stops, width: 780, height: 450 });
  for (const coordinate of [...lines.flat(), ...stops]) {
    const [x,y] = view.project(coordinate);
    expect(x).toBeGreaterThan(20); expect(x).toBeLessThan(view.width - 20);
    expect(y).toBeGreaterThan(20); expect(y).toBeLessThan(view.height - 20);
  }
  expect(view.project([view.longitude,view.latitude])).toEqual([view.width/2,view.height/2]);
});
test('missing token, empty trail, and unavailable map service preserve diagram fallback', async () => {
  delete process.env.MAPBOX_ACCESS_TOKEN;
  expect(await getSegmentTrailImage({ coveredSegments: lines })).toBeNull();
  process.env.MAPBOX_ACCESS_TOKEN='fixture';
  expect(await getSegmentTrailImage({})).toBeNull();
  axios.get.mockRejectedValue(new Error('Map unavailable'));
  expect(await getSegmentTrailImage({ coveredSegments: lines })).toBeNull();
});
