jest.mock('../src/services/mapStaticImage', () => ({ getSegmentTrailImage: jest.fn().mockResolvedValue(null) }));
const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const { generateRouteHistoryPDF, buildRouteHistoryPayload } = require('../src/services/pdf/routeHistoryReport');
const { getSegmentTrailImage } = require('../src/services/mapStaticImage');

function fixture(count = 29) {
  const stops = Array.from({ length: count }, (_, i) => ({ _id: `stop-${i}`, order: i + 1, name: `Stop ${i + 1} - ${i % 3 ? 'Residential collection point' : 'Main street / school and public market'}`, longitude: 123.18 + i * 0.0003, latitude: 13.62 + Math.sin(i / 3) * 0.002 }));
  const sessions = [
    { clientSessionId: 'trip-a', startedAt: '2026-11-15T00:00:00Z', endedAt: '2026-11-15T00:20:00Z' },
    { clientSessionId: 'trip-b', startedAt: '2026-11-15T01:00:00Z' },
  ];
  const trailPoints = [
    { clientSessionId: 'trip-a', longitude: 123.18, latitude: 13.62, recordedAt: '2026-11-15T00:02:00Z' },
    { clientSessionId: 'trip-a', longitude: 123.182, latitude: 13.621, recordedAt: '2026-11-15T00:04:00Z' },
    { clientSessionId: 'trip-b', longitude: 123.186, latitude: 13.619, recordedAt: '2026-11-15T01:01:00Z' },
  ];
  const logs = [
    { stopId: 'stop-0', collectedAt: '2026-11-15T00:02:00Z', exitedAt: '2026-11-15T00:03:00Z', status: 'collected', dwellSeconds: 60 },
    { stopId: 'stop-1', collectedAt: '2026-11-15T00:04:00Z', flaggedForReview: true, dwellSeconds: 10 },
  ];
  return { route: { name: 'QA assigned collection route', barangay: ['Abella'], stops, routePath: { type: 'MultiLineString', coordinates: [stops.slice(0, 15).map(s => [s.longitude, s.latitude]), stops.slice(15).map(s => [s.longitude, s.latitude])] } }, collector: { name: 'QA Driver' }, cycle: { truck: { truckNumber: '36', plateNumber: 'QA-1234' } }, session: sessions[0], sessions, logs, trailPoints, eventDate: '2026-11-15' };
}
async function render(input, filename) {
  const payload = buildRouteHistoryPayload(input, { adminUser: { name: 'QA Admin' } });
  const doc = new PDFDocument({ size: 'LETTER', margin: 46, bufferPages: true });
  const chunks = [], text = [], maps = [];
  let page = 1;
  doc.on('pageAdded', () => { page += 1; });
  const originalText = doc.text.bind(doc);
  doc.text = (value, x, y, options) => {
    if (typeof x === 'number') {
      // Includes captions/markers: every drawn line must stay on its page.
      expect(x).toBeGreaterThanOrEqual(0);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y + doc.currentLineHeight()).toBeLessThanOrEqual(doc.page.height - 15);
      const measured = doc.widthOfString(String(value));
      expect(measured).toBeLessThanOrEqual((options?.width || doc.page.width - x) + 0.2);
      text.push({ value: String(value), page, x, y });
    }
    return originalText(value, x, y, options);
  };
  const originalRect = doc.rect.bind(doc);
  doc.rect = (x, y, w, h) => { if (h >= 180) maps.push({ x, y, w, h, page }); return originalRect(x, y, w, h); };
  const finished = new Promise((resolve, reject) => { doc.on('data', chunk => chunks.push(chunk)); doc.on('end', resolve); doc.on('error', reject); });
  await generateRouteHistoryPDF(doc, payload); await finished;
  const buffer = Buffer.concat(chunks);
  if (process.env.ROUTE_PDF_QA_DIR && filename) { fs.mkdirSync(process.env.ROUTE_PDF_QA_DIR, { recursive: true }); fs.writeFileSync(path.join(process.env.ROUTE_PDF_QA_DIR, filename), buffer); }
  expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  return { payload, text, maps, pages: page, allText: text.map(t => t.value).join('\n') };
}
beforeEach(() => getSegmentTrailImage.mockReset().mockResolvedValue(null));

test('29 stops paginate compactly, keeping map and rows in bounds with repeated headers', async () => {
  const input = fixture();
  const result = await render(input, 'route-history-29-stops.pdf');
  expect(result.pages).toBeLessThanOrEqual(4);
  expect(result.pages).toBeGreaterThan(1);
  expect(result.maps.length).toBeGreaterThan(0);
  result.maps.forEach(map => expect(map.y + map.h).toBeLessThanOrEqual(740));
  input.route.stops.forEach(stop => expect(result.allText).toContain(`${stop.order}. Stop ${stop.order}`));
  const tablePages = new Set(result.text.filter(t => /\d+\. Stop \d+/.test(t.value)).map(t => t.page));
  tablePages.forEach(page => expect(result.text.some(t => t.page === page && t.value === 'Recorded entry')).toBe(true));
  expect(result.allText).toContain('Nov 15, 2026, 8:02 AM');
  expect(result.allText).toContain('Nov 15, 2026, 8:03 AM');
  expect(result.allText).toContain('No visit recorded');
  expect(result.allText).toContain('Flagged for review');
  expect(result.allText).not.toContain('Geofence-Verified');
  expect(getSegmentTrailImage).toHaveBeenCalledWith(expect.objectContaining({ stopCoordinates: input.route.stops.map(s => [s.longitude, s.latitude]), expectedSegments: input.route.routePath.coordinates, coveredSegments: [[[123.18, 13.62], [123.182, 13.621]], [[123.186, 13.619]]] }));
  console.log(`29-stop report: ${result.pages} pages, all measured text/map bounds valid.`);
});

test('empty/missing events never invent passage times or a travelled path', async () => {
  const input = fixture(1); input.trailPoints = []; input.logs = []; input.sessions = []; input.session = null;
  input.route.stops[0].longitude = null;
  input.route.routePath = null;
  input.trail = { coveredSegments: [[[120, 10], [121, 11]]] };
  const result = await render(input, 'route-history-no-events.pdf');
  expect(result.payload.trail.coveredSegments).toEqual([]);
  expect(result.payload.trail.firstRecordedAt).toBeNull();
  expect(result.payload.recordedTrips).toEqual([]);
  expect(result.allText).toContain('No uploaded GPS trail');
  expect(result.allText).toContain('No visit recorded');
  expect(result.allText).toContain('1 stop(s) have no coordinates');
  expect(result.allText).not.toContain('GPS travel recorded: Nov');
  expect(result.pages).toBeLessThanOrEqual(2);
});

test('near-bottom and oversized cells continue without clipping or lost text', async () => {
  const input = fixture(4);
  input.route.name = 'Long route '.repeat(90) + 'ROUTE-END';
  input.route.stops[0].name = 'Very long street name '.repeat(160) + 'STOP-END';
  input.route.stops[1].name = 'UNBROKEN'.repeat(150) + 'TOKEN-END';
  const result = await render(input, 'route-history-long-text.pdf');
  expect(result.allText).toContain('ROUTE-END'); expect(result.allText).toContain('STOP-END');
  expect(result.allText.replace(/\n/g, '')).toContain('TOKEN-END');
  expect(result.allText).toContain('4. Stop 4');
  expect(result.pages).toBeLessThan(10);
});

test('trip timestamps remain separate from geofence events, including overnight and missing end', async () => {
  const input = fixture(); input.sessions[1].startedAt = '2026-11-15T15:58:00Z'; input.trailPoints[2].recordedAt = '2026-11-15T16:01:00Z';
  const result = await render(input);
  expect(result.payload.recordedTrips[1].endedAt).toBeNull();
  expect(result.allText).toContain('Nov 16, 2026, 12:01 AM');
  expect(result.payload.trail.entryTime).toBe(input.logs[0].collectedAt);
  expect(result.payload.trail.lastRecordedAt).toBe(input.trailPoints[2].recordedAt);
});

test('unlisted stops are retained and short trails get a focused view', async () => {
  const input = fixture(1); input.route.routePath = { type: 'LineString', coordinates: [[123, 13], [124, 14]] };
  input.logs.push({ stopId: 'removed', collectedAt: '2026-11-15T03:00:00Z', exitedAt: '2026-11-15T03:02:00Z' });
  const result = await render(input, 'route-history-focused.pdf');
  expect(result.allText).toContain('Unlisted / removed stop');
  expect(result.allText).toContain('RECORDED TRAIL - CLOSE VIEW');
  expect(getSegmentTrailImage).toHaveBeenCalledTimes(2);
  expect(getSegmentTrailImage.mock.calls[1][0].expectedSegments).toEqual([]);
});

test('valid map image and map failure both retain the report and stop list', async () => {
  getSegmentTrailImage.mockResolvedValueOnce(fs.readFileSync(path.join(__dirname, '../assets/swmo-resiklean-logo.png')));
  const result = await render(fixture(2));
  expect(result.allText).toContain('Map shows uploaded locations');
  expect(result.allText).toContain('2. Stop 2');
  getSegmentTrailImage.mockRejectedValueOnce(new Error('Map unavailable'));
  const fallback = await render(fixture(2));
  expect(fallback.allText).toContain('Geographic diagram');
  expect(fallback.allText).toContain('2. Stop 2');
});


test('start/last markers follow timestamps across overlapping sessions and ignore invalid positions', () => {
  const input = fixture();
  input.trailPoints.push({ clientSessionId: 'trip-a', longitude: 123.19, latitude: 13.625, recordedAt: '2026-11-15T02:00:00Z' });
  input.trailPoints.push({ clientSessionId: 'trip-a', longitude: null, latitude: 13.625, recordedAt: '2026-11-15T03:00:00Z' });
  input.trailPoints.reverse();
  const payload = buildRouteHistoryPayload(input, {});
  expect(payload.trail.entryCoord).toEqual([123.18, 13.62]);
  expect(payload.trail.exitCoord).toEqual([123.19, 13.625]);
  expect(payload.trail.lastRecordedAt).toBe('2026-11-15T02:00:00Z');
  expect(payload.trail.pointCount).toBe(4);
});
