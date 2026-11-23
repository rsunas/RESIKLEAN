const { trailSegments, routeSegments } = require('../routeHistoryTrail');
const path = require('path');
const fs = require('fs');
const { getSegmentTrailImage } = require('../mapStaticImage');
const { trailMapViewport } = require('../trailMapViewport');

const LOGO_PATH = path.resolve(__dirname, '../../../assets/swmo-resiklean-logo.png');

const COLORS = {
  tealDark: '#07815f',
  tealLight: '#14a87d',
  tealBg: '#EBF7F5',
  tealBorder: '#9bc6ad',
  red: '#b42318',
  redSoft: '#d42f54',
  grey: '#65766c',
  greyLight: '#a3b0a8',
  dark: '#20372a',
  tableBorder: '#d9e4de',
  rule: '#0f6e53',
};

function manilaDate(date, options = {}) {
  const d = date ? new Date(date) : new Date();
  if (!Number.isFinite(d.getTime())) return '—';
  const fmtOpts = {
    timeZone: 'Asia/Manila',
    ...options,
  };
  return new Intl.DateTimeFormat('en-US', fmtOpts).format(d);
}

function manilaDateTime(date) {
  return manilaDate(date, {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

function manilaTime(date) {
  return manilaDate(date, { hour: 'numeric', minute: '2-digit', hour12: true });
}

function manilaDateShort(date) {
  return manilaDate(date, { year: 'numeric', month: 'long', day: 'numeric' });
}

function barangayCode(barangay) {
  const name = (Array.isArray(barangay) ? barangay.join(' ') : String(barangay || '')).toLowerCase();
  if (name.includes('triangulo')) return 'TRI';
  if (name.includes('dayangdang')) return 'DAY';
  if (name.includes('concepcion grande')) return 'CON';
  if (name.includes('bagumbayan')) return 'BAG';
  if (name.includes('calaauag') || name.includes('calauag')) return 'CAL';
  if (name.includes('dinaga')) return 'DIN';
  if (name.includes('liboton')) return 'LIB';
  if (name.includes('naga')) return 'NAG';
  const first = name.replace(/[^a-z]/g, '').slice(0, 3).toUpperCase();
  return first || 'ARE';
}

// All report text is measured before drawing. Never let PDFKit auto-break an
// absolute-positioned cell: that was producing pages containing single labels.
function reportLayout(doc) {
  const margin = 46;
  const width = doc.page.width - margin * 2;
  const bottom = () => doc.page.height - 52;
  let y = 0;
  let page = 0;
  function text(value, x, top, cellWidth, size = 10, bold = false, color = COLORS.dark) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size).fillColor(color);
    doc.text(String(value ?? ''), x, top, { width: cellWidth, height: size + 4, lineBreak: false });
  }
  function lines(value, cellWidth, size = 10, bold = false) {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(size);
    const result = [];
    for (const paragraph of String(value ?? '').split('\n')) {
      let line = '';
      for (const word of paragraph.split(/\s+/).filter(Boolean)) {
        if (line && doc.widthOfString(`${line} ${word}`) > cellWidth) {
          result.push(line); line = '';
        }
        // Split even a very long unbroken route name/reference without clipping.
        for (const char of (line ? ` ${word}` : word)) {
          if (line && doc.widthOfString(line + char) > cellWidth) {
            result.push(line); line = '';
          }
          line += char;
        }
      }
      result.push(line);
    }
    return result;
  }
  function newPage() {
    if (page) doc.addPage();
    page += 1;
    if (page === 1 && fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, margin, 32, { fit: [148, 40] });
    } else text('ResiKlean / SWMO', margin, 42, width / 2, 14, true, COLORS.tealDark);
    text('Route history report', margin + width / 2, 40, width / 2, 20, true);
    text(page === 1 ? 'Recorded travel and stop events' : 'Continued', margin + width / 2, 65, width / 2, 9, false, COLORS.grey);
    doc.strokeColor(COLORS.tealDark).lineWidth(1).moveTo(margin, 84).lineTo(margin + width, 84).stroke();
    // Footer remains in the reserved margin, without changing page margins.
    text(`Page ${page}  |  Asia/Manila (UTC+08:00)`, margin, doc.page.height - 32, width, 8, false, COLORS.grey);
    y = 98;
  }
  function ensure(height) { if (y + height > bottom()) newPage(); }
  function paragraph(value, { size = 9, color = COLORS.grey, bold = false, gap = 8 } = {}) {
    for (const line of lines(value, width, size, bold)) {
      ensure(size + 4); text(line, margin, y, width, size, bold, color); y += size + 4;
    }
    y += gap;
  }
  function heading(title, followingHeight = 40) {
    ensure(25 + followingHeight);
    text(title, margin, y, width, 11, true, COLORS.tealDark); y += 25;
  }
  function table(headers, fractions, rows) {
    const widths = fractions.map(f => f * width);
    const header = (nextHeight = 27) => {
      ensure(25 + nextHeight);
      doc.rect(margin, y, width, 25).fill(COLORS.tealBg);
      let x = margin;
      headers.forEach((label, i) => { text(label, x + 7, y + 7, widths[i] - 14, 9, true); x += widths[i]; });
      y += 25;
    };
    const firstHeight = rows.length ? Math.max(...rows[0].map((value, i) => lines(value, widths[i] - 14, 9).length)) * 13 + 14 : 27;
    header(Math.min(firstHeight, bottom() - 123));
    for (const row of rows) {
      const cells = row.map((value, i) => lines(value, widths[i] - 14, 9));
      let offset = 0;
      const count = Math.max(...cells.map(cell => cell.length));
      while (offset < count) {
        const remainingHeight = (count - offset) * 13 + 14;
        // Keep normal rows whole. Extra-long cells continue under repeated headers.
        if (y + Math.min(remainingHeight, bottom() - 123) > bottom()) { newPage(); header(); }
        const take = Math.min(count - offset, Math.floor((bottom() - y - 14) / 13));
        if (take < 1) { newPage(); header(); continue; }
        let x = margin;
        cells.forEach((cell, i) => {
          cell.slice(offset, offset + take).forEach((line, n) => text(line, x + 7, y + 7 + n * 13, widths[i] - 14, 9));
          x += widths[i];
        });
        y += take * 13 + 14;
        doc.strokeColor(COLORS.tableBorder).lineWidth(0.5).moveTo(margin, y).lineTo(margin + width, y).stroke();
        offset += take;
        if (offset < count) { newPage(); header(); }
      }
    }
    y += 14;
  }
  newPage();
  return { margin, width, text, lines, ensure, paragraph, heading, table,
    get y() { return y; }, set y(value) { y = value; } };
}

const validCoordinate = c => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
const recordedTime = value => value && Number.isFinite(new Date(value).getTime()) ? manilaDateTime(value) : 'Not recorded';

function drawTrailDiagram(doc, box, trail, stops, hasBasemap = false) {
  const expected = trail.expectedSegments || [];
  const covered = trail.coveredSegments || [];
  const coords = [...expected.flat(), ...covered.flat(), ...stops.map(s => s.coordinate)].filter(validCoordinate);
  doc.save();
  if (!hasBasemap) doc.rect(box.x, box.y, box.width, box.height).fill('#f4faf7');
  doc.rect(box.x, box.y, box.width, box.height).clip();
  if (!coords.length) {
    doc.fillColor(COLORS.grey).font('Helvetica').fontSize(10).text('No route geometry or GPS coordinates recorded.', box.x + 20, box.y + box.height / 2, { width: box.width - 40, lineBreak: false });
    doc.restore(); return;
  }
  const camera = trailMapViewport({ ...trail, stopCoordinates: stops.map(s => s.coordinate), width: Math.round(box.width * 1.5), height: Math.round(box.height * 1.5) });
  const project = coordinate => {
    const [x, y] = camera.project(coordinate);
    return [box.x + x * box.width / camera.width, box.y + y * box.height / camera.height];
  };
  const path = (line, color, dashed) => {
    const points = line.filter(validCoordinate).map(project);
    if (!points.length) return;
    doc.strokeColor(color).fillColor(color).lineWidth(dashed ? 2 : 2.5).lineJoin('round').lineCap('round');
    if (dashed) doc.dash(4, { space: 3 }); else doc.undash();
    if (points.length === 1) doc.circle(...points[0], 3).fill();
    else { doc.moveTo(...points[0]); points.slice(1).forEach(p => doc.lineTo(...p)); doc.stroke(); }
    doc.undash();
  };
  expected.forEach(line => path(line, COLORS.greyLight, true));
  covered.forEach(line => path(line, COLORS.redSoft, false));
  // Small dots keep dense stop clusters from hiding the recorded travel.
  stops.forEach(stop => {
    if (!validCoordinate(stop.coordinate)) return;
    doc.circle(...project(stop.coordinate), 2.5).fillAndStroke(COLORS.tealDark, '#ffffff');
  });
  [[trail.entryCoord, 'Start', COLORS.redSoft], [trail.exitCoord, 'Last GPS', COLORS.dark]].forEach(([c, label, color]) => {
    if (!validCoordinate(c)) return;
    const [x, y] = project(c);
    doc.circle(x, y, 4).fillAndStroke(color, '#ffffff');
    doc.fillColor(color).font('Helvetica-Bold').fontSize(8).text(label, Math.min(x + 7, box.x + box.width - 48), y - (label === 'Start' ? 15 : -6), { width: 48, lineBreak: false });
  });
  doc.restore();
}

async function generateRouteHistoryPDF(doc, data) {
  const reference = data.documentReference || {};
  const summary = data.recordSummary || {};
  const trail = data.trail || {};
  const stops = [...(data.stops || [])].sort((a, b) => (a.order || 0) - (b.order || 0)).map((stop, i) => ({ ...stop, number: i + 1, coordinate: [stop.longitude, stop.latitude] }));
  doc.info.Title = `Route History Report - ${reference.referenceId || 'ResiKlean'}`;
  doc.info.Author = 'ResiKlean - Naga City SWMO';
  const layout = reportLayout(doc);
  const { margin, width } = layout;
  layout.paragraph(`${reference.reportDate || 'Date not recorded'} | ${reference.referenceId || 'Reference not recorded'}`);
  layout.table(['Record', 'Details'], [0.23, 0.77], [
    ['Assigned route', summary.routeName || 'Route name not recorded'],
    ['Driver / truck', `${summary.collectorName || 'Unassigned'} / ${[].concat(summary.truckAssigned || 'No truck recorded').join(' - ')}`],
    ['Area', reference.area || 'Not recorded'],
    ['Shift', `${summary.shiftStart || 'Not recorded'} to ${summary.shiftEnd || 'Not recorded'}`],
    ['Stop status', `${summary.segmentStatus || 'Unknown'} | ${stops.length} assigned stops`],
  ]);

  async function mapSection(title, mapTrail, mapStops, height) {
    // Reserve the entire map, legend and caption; move it together if needed.
    layout.heading(title, height + 65);
    const box = { x: margin, y: layout.y, width, height };
    let image = null;
    try {
      image = await getSegmentTrailImage({ ...mapTrail, stopCoordinates: mapStops.map(s => s.coordinate).filter(validCoordinate), width: Math.round(width * 1.5), height: height * 1.5 });
      if (image) doc.image(image, box.x, box.y, { width, height });
    } catch { image = null; }
    drawTrailDiagram(doc, box, mapTrail, mapStops, Boolean(image));
    layout.y += height + 10;
    layout.paragraph('Red: recorded GPS travel. Grey dashed: assigned route. Green markers: assigned stops.', { size: 8, gap: 3 });
    layout.paragraph(image ? 'Map shows uploaded locations; stop markers do not confirm a visit.' : 'Geographic diagram (street map unavailable). All uploaded GPS points are still drawn; stop details are listed below.', { size: 8, gap: 3 });
  }
  await mapSection('ASSIGNED ROUTE, RECORDED TRAIL AND STOPS', trail, stops, 300);
  layout.paragraph(`GPS travel recorded: ${recordedTime(trail.firstRecordedAt)} to ${recordedTime(trail.lastRecordedAt)}. ${trail.pointCount || 0} uploaded GPS points.`, { size: 9 });
  layout.paragraph('GPS travel can include roads outside the assigned route. Lines connect uploaded points within each recorded segment; they do not prove collection or fill gaps between trips.', { size: 8 });
  if (!trail.expectedCoordinates?.length) layout.paragraph('Assigned route geometry is not available; listed stops are still included below.');
  if (!trail.coveredCoordinates?.length) layout.paragraph('No uploaded GPS trail for this record. No travelled path is inferred from the assigned route.');
  const missingCoordinates = stops.filter(s => !validCoordinate(s.coordinate)).length;
  if (missingCoordinates) layout.paragraph(`${missingCoordinates} stop(s) have no coordinates and appear in the table only.`);

  // Every recorded trip gets an unobstructed, larger travel view.
  if (trail.coveredCoordinates?.length) {
    await mapSection('RECORDED TRAIL - CLOSE VIEW', { ...trail, expectedCoordinates: [], expectedSegments: [] }, [], 320);
  }
  layout.paragraph('This export includes every GPS point uploaded for this route and report date. Points waiting on a phone appear after sync and a new export.', { size: 8 });
  layout.heading('RECORDED TRIPS', 140);
  layout.paragraph('Trip start/end are device trip events. GPS first/last are uploaded locations; neither is a verified stop entry or exit.');
  const trips = data.recordedTrips || [];
  if (trips.length) layout.table(['Trip', 'Trip start / end', 'GPS first / last', 'Points'], [0.08, 0.39, 0.43, 0.10], trips.map((trip, i) => [
    String(i + 1), `${recordedTime(trip.startedAt)}\n${recordedTime(trip.endedAt)}`, `${recordedTime(trip.firstRecordedAt)}\n${recordedTime(trip.lastRecordedAt)}`, String(trip.pointCount),
  ]));
  else layout.paragraph('No trip session or timestamped GPS events recorded.');
  layout.heading('STOPS AND RECORDED PASSAGE TIMES', 115);
  layout.paragraph('Entry and exit below are recorded stop-geofence events, in Manila time. "Not recorded" means there is no event confirming passage. Expected schedules are not used as actual times.');
  const logs = data.logs || [];
  const seen = new Set();
  const rows = [];
  function stopRow(stop, log) {
    const status = !log ? 'No visit recorded' : log.flaggedForReview ? 'Flagged for review' : !log.exitedAt ? 'Exit not recorded' : 'Collected';
    return [stop ? `${stop.number}. ${stop.name || 'Unnamed stop'}` : 'Unlisted / removed stop', recordedTime(log?.collectedAt), recordedTime(log?.exitedAt), `${status}${Number.isFinite(log?.dwellSeconds) ? `\nDwell: ${log.dwellSeconds}s` : ''}`];
  }
  for (const stop of stops) {
    const matches = logs.filter(log => stop._id != null && String(log.stopId) === String(stop._id));
    if (!matches.length) rows.push(stopRow(stop));
    matches.forEach(log => { seen.add(log); rows.push(stopRow(stop, log)); });
  }
  logs.filter(log => !seen.has(log)).forEach(log => rows.push(stopRow(null, log)));
  if (rows.length) layout.table(['Stop', 'Recorded entry', 'Recorded exit', 'Outcome'], [0.35, 0.22, 0.22, 0.21], rows);
  else layout.paragraph('No assigned stops or stop events recorded.');
  layout.paragraph(`Generated by ${reference.generatedBy || 'Admin'} | Exported ${reference.exportedAt || recordedTime(new Date())}`, { size: 8 });
  doc.end();
}

function buildRecordedTrips(input) {
  const groups = new Map();
  const sessions = Array.isArray(input.sessions) ? input.sessions : (input.session ? [input.session] : []);
  sessions.forEach(session => groups.set(session.clientSessionId || 'legacy', { ...session, points: [] }));
  (input.trailPoints || []).forEach(point => {
    const key = point.clientSessionId || 'legacy';
    if (!groups.has(key)) groups.set(key, { points: [] });
    if (validCoordinate([point.longitude, point.latitude])) groups.get(key).points.push(point);
  });
  return [...groups.values()].map(trip => {
    const times = trip.points.map(p => p.recordedAt).filter(value => value && Number.isFinite(new Date(value).getTime())).sort((a, b) => new Date(a) - new Date(b));
    return { startedAt: trip.startedAt || null, endedAt: trip.endedAt || null, firstRecordedAt: times[0] || null, lastRecordedAt: times.at(-1) || null, pointCount: trip.points.length };
  });
}

function buildRouteHistoryPayload(input, { adminUser, referenceCounter = 1 }) {
  const logs = Array.isArray(input.logs) ? input.logs : [];
  const firstLog = logs[0] || {};
  const lastLog = logs[logs.length - 1] || {};
  const route = input.route || {};
  const collector = input.collector || {};
  const cycle = input.cycle || {};
  const truck = cycle.truck || {};
  const session = input.session || {};

  const eventDate = input.eventDate || firstLog.eventDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());
  const dateTokens = eventDate.split('-');
  const mmdd = `${dateTokens[1]}${dateTokens[2]}`;
  const code = barangayCode(route.barangay);
  const counter = String(referenceCounter).padStart(3, '0');
  const referenceId = `RH-${dateTokens[0]}-${mmdd}-${code}-${counter}`;

  const flaggedCount = logs.filter((l) => l.flaggedForReview).length;
  const collected = logs.filter((l) => l.status === 'collected').length;
  const totalStops = route.stops?.length || 0;
  const orderedPoints = (Array.isArray(input.trailPoints) ? input.trailPoints : [])
    .filter(point => validCoordinate([point.longitude, point.latitude]))
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const trailTimestamps = orderedPoints
    .map((point) => point.recordedAt)
    .filter(value => value && Number.isFinite(new Date(value).getTime()))
    .sort((a, b) => new Date(a) - new Date(b));
  const missingExit = logs.length > 0 && (logs.some((l) => l.flaggedForReview) || !lastLog.exitedAt);
  const statusText = totalStops > 0 && collected >= totalStops && flaggedCount === 0 && !missingExit
    ? 'Collected'
    : missingExit
      ? 'FLAGGED — NOT COLLECTED'
      : flaggedCount > 0
        ? 'FLAGGED — NOT COLLECTED'
        : collected > 0
          ? `Partial — ${collected}/${totalStops}`
          : 'Not collected';

  const area = Array.isArray(route.barangay) ? `${route.barangay.filter(Boolean).join(', ')}, Naga City` : `${route.barangay || 'Naga City'}, Naga City`;
  const stopNames = route.stops?.map((s) => s.name).filter(Boolean);
  const streetSegment = stopNames?.[0] ? `${stopNames[0]}${stopNames.length > 1 ? `, ${stopNames.slice(1).join(' · ')}` : ''}` : route.name || 'Collected segment';
  const firstCollectedAt = logs.reduce((m, l) => !m || new Date(l.collectedAt) < new Date(m) ? l.collectedAt : m, null);
  const lastExitedAt = logs.reduce((m, l) => !l.exitedAt ? m : (!m || new Date(l.exitedAt) > new Date(m) ? l.exitedAt : m), null);
  const geofenceEntry = firstCollectedAt ? `${manilaTime(firstCollectedAt)}` : 'Not logged';
  const geofenceExit = lastExitedAt ? `${manilaTime(lastExitedAt)}` : 'Not logged — no exit event recorded';
  const collectorName = collector.name || 'Unassigned';
  const collectorSubtitle = collector.location || 'SWMO Naga City';
  const truckAssigned = truck.truckNumber || truck.plateNumber
    ? [`${truck.truckNumber || 'Truck'}${truck.plateNumber ? `  ${truck.plateNumber}` : ''}${truck.color ? ` · ${truck.color}` : ''}`, `Plate No. ${truck.plateNumber || 'Unregistered'}`]
    : 'No truck recorded';
  const shiftStartValue = cycle.shiftStart || session.startedAt || firstCollectedAt;
  const shiftEndValue = cycle.shiftEnd || session.endedAt;
  const shiftStart = shiftStartValue ? `${manilaTime(shiftStartValue)}, ${manilaDateShort(shiftStartValue)}` : '—';
  const shiftEnd = shiftEndValue ? `${manilaTime(shiftEndValue)}, ${manilaDateShort(shiftEndValue)}` : '—';
  const dwellNote = flaggedCount > 0
    ? `${flaggedCount} stop${flaggedCount > 1 ? 's' : ''} flagged — dwell below 30s threshold`
    : missingExit
      ? 'No exit event recorded — segment flagged'
      : collected === 0
        ? 'No stop exit events recorded'
      : `All stops exited within SWMO dwell thresholds`;

  const trail = input.trail || {};
  const coveredSegments = Array.isArray(input.trailPoints) ? trailSegments(input.trailPoints) : (trail.coveredSegments || (trail.coveredCoordinates?.length ? [trail.coveredCoordinates] : []));
  const expectedSegments = routeSegments(route.routePath);
  const coveredCoordinates = coveredSegments.flat();
  const expectedCoordinates = expectedSegments.flat();
  const entryCoord = orderedPoints.length ? [orderedPoints[0].longitude, orderedPoints[0].latitude] : (coveredCoordinates[0] || null);
  const exitCoord = orderedPoints.length ? [orderedPoints.at(-1).longitude, orderedPoints.at(-1).latitude] : (coveredCoordinates.at(-1) || null);

  const reportDate = manilaDateShort(eventDate.length === 10 && /^\d/.test(eventDate) ? new Date(`${eventDate}T00:00:00`) : new Date());
  const exportedAt = manilaDateTime(new Date());
  const adminName = adminUser?.name ? `Admin — ${adminUser.name}, SWMO` : 'Admin — SWMO';

  return {
    recordSummary: {
      routeName: route.name || 'Unnamed route',
      streetSegment,
      collectorName,
      collectorSubtitle,
      truckAssigned,
      shiftStart,
      shiftEnd,
      geofenceEntry,
      geofenceExit,
      segmentStatus: statusText,
      dwellNote,
    },
    documentReference: {
      referenceId,
      reportDate,
      area,
      status: statusText,
      generatedBy: adminName,
      exportedAt,
    },
    trail: {
      coveredSegments,
      expectedSegments,
      coveredCoordinates,
      expectedCoordinates,
      entryCoord,
      exitCoord,
      firstRecordedAt: trailTimestamps[0] || null,
      lastRecordedAt: trailTimestamps.at(-1) || null,
      pointCount: coveredCoordinates.length,
      entryTime: firstCollectedAt,
      exitTime: lastExitedAt,
    },
    recordedTrips: buildRecordedTrips(input),
    logs,
    stops: route.stops || [],
    session,
    referenceId,
  };
}

module.exports = {
  generateRouteHistoryPDF,
  buildRouteHistoryPayload,
  barangayCode,
  manilaDate,
  manilaDateTime,
  manilaTime,
  manilaDateShort,
};
