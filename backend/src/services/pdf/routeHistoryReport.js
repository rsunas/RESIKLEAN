const path = require('path');
const fs = require('fs');
const { getSegmentTrailImage } = require('../mapStaticImage');

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

function areaFromStop(stopName, barangay) {
  const stop = stopName || '';
  const brgy = Array.isArray(barangay) ? barangay.join(', ') : String(barangay || '');
  const area = `${stop}${brgy ? `, ${brgy}` : ''}`;
  return area || 'Naga City';
}

function drawTwoPartRule(doc, x, y, width) {
  doc.save();
  doc.lineWidth(3).strokeColor(COLORS.tealLight).moveTo(x, y).lineTo(x + width, y).stroke();
  doc.lineWidth(1).strokeColor(COLORS.rule).moveTo(x, y + 2).lineTo(x + width, y + 2).stroke();
  doc.restore();
}

function drawTable(doc, x, y, width, rows, { labelWidth, colHeader, accent } = {}) {
  const valueX = x + (labelWidth || 140);
  const valueWidth = width - (labelWidth || 140);
  const padY = 11;
  let cursorY = y;
  doc.save();
  if (colHeader) {
    doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(10);
    doc.text(colHeader.toUpperCase(), x, cursorY);
    cursorY += 18;
  }
  rows.forEach(([label, value, opts = {}]) => {
    doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text(label, x, cursorY);
    const valueColor = opts.color || COLORS.dark;
    const valueBold = opts.bold ? 'Helvetica-Bold' : 'Helvetica';
    const valueSize = opts.size || 11;
    
    const lines = Array.isArray(value) ? value : [value];
    
    let currentY = cursorY;
    lines.forEach((line) => {
      if (typeof line === 'object' && line.label) {
        doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9);
        const height = doc.heightOfString(line.label, { width: valueWidth - 8, align: 'left' });
        doc.text(line.label, valueX, currentY, { width: valueWidth - 8, align: 'left' });
        currentY += height + 2;
      } else {
        doc.fillColor(valueColor).font(valueBold).fontSize(valueSize);
        const height = doc.heightOfString(line, { width: valueWidth - 8, align: 'left' });
        doc.text(line, valueX, currentY, { width: valueWidth - 8, align: 'left' });
        currentY += height + 4;
      }
    });
    
    const rowHeight = Math.max(currentY - cursorY, 16);
    
    doc.moveTo(x, cursorY + rowHeight + 4).lineTo(x + width, cursorY + rowHeight + 4).strokeColor(COLORS.tableBorder).lineWidth(0.5).stroke();
    if (accent && opts.highlight) {
      doc.fillColor(accent).rect(x - 2, cursorY - 2, 3, rowHeight + 6).fill();
    }
    cursorY += rowHeight + 12;
  });
  doc.restore();
  return cursorY;
}

function drawLegend(doc, x, y, width, data) {
  const entry = data.entryTime ? manilaTime(data.entryTime) : 'Not logged';
  const exit = data.exitTime ? manilaTime(data.exitTime) : 'Not recorded';
  const dwell = data.dwellNote || 'No exit event recorded';
  doc.save();
  doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(10).text('LEGEND', x, y);
  let cursorY = y + 18;
  const swatchX = x;
  const textX = x + 38;
  const swatchWidth = 28;
  doc.lineWidth(3).strokeColor(COLORS.redSoft).moveTo(swatchX, cursorY + 4).lineTo(swatchX + swatchWidth, cursorY + 4).stroke();
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(10).text('Truck path — covered', textX, cursorY);
  cursorY += 20;
  doc.save();
  doc.lineWidth(3).strokeColor(COLORS.redSoft).dash(3, 3, { space: 3 }).moveTo(swatchX, cursorY + 4).lineTo(swatchX + swatchWidth, cursorY + 4).stroke();
  doc.undash();
  doc.restore();
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(10).text('Expected path — not covered', textX, cursorY);
  cursorY += 26;
  doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Entry time:', x, cursorY);
  doc.fillColor(COLORS.redSoft).font('Helvetica-Bold').fontSize(10).text(`Entry: ${entry}`, x + 70, cursorY);
  cursorY += 18;
  doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Exit:', x, cursorY);
  doc.fillColor(data.exitTime ? COLORS.dark : COLORS.red).font(data.exitTime ? 'Helvetica' : 'Helvetica-Bold').fontSize(10).text(data.exitTime ? exit : `Exit: ${exit}`, x + 70, cursorY);
  cursorY += 18;
  doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Dwell:', x, cursorY);
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(10).text(dwell, x + 70, cursorY, { width: width - 70 });
  doc.restore();
  return cursorY + 20;
}

async function generateRouteHistoryPDF(doc, data) {
  const pageWidth = doc.page.width;
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;

  doc.info.Title = `Route History Report — ${data.documentReference?.referenceId || 'ResiKlean'}`;
  doc.info.Author = 'ResiKlean — Naga City SWMO';
  doc.info.Producer = 'ResiKlean Solid Waste Management System';

  let logoOk = false;
  try {
    if (fs.existsSync(LOGO_PATH)) logoOk = true;
  } catch {}

  // ── Header block ──────────────────────────────────────────────────────
  let cursorY = margin + 6;
  if (logoOk) {
    doc.image(LOGO_PATH, margin, cursorY, { height: 46 });
  } else {
    doc.save();
    doc.fillColor(COLORS.tealDark).roundedRect(margin, cursorY, 50, 46, 8).fill();
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(18).text('R', margin + 18, cursorY + 13);
    doc.restore();
    
    const brandX = margin + 62;
    doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(22).text('ResiKlean', brandX, cursorY + 6);
    doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('SOLID WASTE MANAGEMENT SYSTEM', brandX, cursorY + 28, { characterSpacing: 0.5 });
  }

  doc.fillColor(COLORS.greyLight).font('Helvetica').fontSize(10).text('NAGA CITY SOLID WASTE MANAGEMENT OFFICE', margin, cursorY + 6, { width: contentWidth, align: 'right' });
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(26).text('Route History Report', margin, cursorY + 24, { width: contentWidth, align: 'right' });
  doc.fillColor(COLORS.grey).font('Helvetica-Oblique').fontSize(10).text('Single-Record Export · Geofence-Verified', margin, cursorY + 44, { width: contentWidth, align: 'right' });

  cursorY = margin + 82;
  drawTwoPartRule(doc, margin, cursorY, contentWidth);
  cursorY += 14;

  // ── Record Summary + Document Reference ───────────────────────────────
  const summary = data.recordSummary || {};
  const reference = data.documentReference || {};
  const segmentStatus = summary.segmentStatus || 'Unknown';
  const isFlagged = /flag|not collect/i.test(segmentStatus);

  const leftWidth = Math.floor(contentWidth * 0.58);
  const rightWidth = contentWidth - leftWidth - 20;

  const summaryRows = [
    ['Street Segment', summary.streetSegment || 'Unrecorded segment'],
    ['Collector Name', [summary.collectorName || 'Unassigned collector', summary.collectorSubtitle || 'SWMO Naga City']],
    ['Truck Assigned', summary.truckAssigned || 'No truck recorded for this shift'],
    ['Shift Start / End', [summary.shiftStart || '—', { label: 'Shift End' }, summary.shiftEnd || '—']],
    ['Geofence Entry', summary.geofenceEntry || 'Not logged'],
    ['Geofence Exit', summary.geofenceExit || 'Not logged — no exit event recorded', { color: COLORS.red, bold: !summary.geofenceExit }],
    ['Segment Status', segmentStatus, { color: isFlagged ? COLORS.red : COLORS.tealDark, bold: true, size: 12, highlight: true }],
  ];
  const refRows = [
    ['REFERENCE ID', reference.referenceId || 'RH-UNASSIGNED', { bold: true }],
    ['REPORT DATE', reference.reportDate || manilaDateShort(new Date())],
    ['AREA', reference.area || 'Naga City'],
    ['STATUS', reference.status || segmentStatus, { color: isFlagged ? COLORS.red : COLORS.tealDark, bold: true }],
    ['GENERATED BY', reference.generatedBy || 'Admin — SWMO Naga City'],
    ['EXPORTED', reference.exportedAt || manilaDateTime(new Date())],
  ];

  const leftBottom = drawTable(doc, margin, cursorY, leftWidth, summaryRows, { colHeader: 'RECORD SUMMARY', accent: COLORS.tealDark });
  drawTable(doc, margin + leftWidth + 20, cursorY, rightWidth, refRows, { colHeader: 'DOCUMENT REFERENCE', labelWidth: 98 });

  cursorY = Math.max(leftBottom, cursorY + refRows.length * 18 + 34) + 8;

  drawTwoPartRule(doc, margin, cursorY, contentWidth);
  cursorY += 16;

  // ── Segment Trail ─────────────────────────────────────────────────────
  
  // Temporarily remove the bottom margin so our absolute-positioned map/legend 
  // elements don't trigger accidental page breaks when they get near the bottom.
  const originalBottomMargin = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  
  doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(11).text('SEGMENT TRAIL', margin, cursorY);
  cursorY += 18;

  const trailBox = { x: margin, y: cursorY, width: Math.floor(contentWidth * 0.62), height: 260 };
  const legendBox = { x: trailBox.x + trailBox.width + 20, y: cursorY, width: contentWidth - trailBox.width - 20 };

  doc.save();
  doc.strokeColor(COLORS.tableBorder).lineWidth(1).roundedRect(trailBox.x, trailBox.y, trailBox.width, trailBox.height, 6).stroke();
  doc.restore();

  const trail = data.trail || {};
  let trailBuffer = null;
  try {
    trailBuffer = await getSegmentTrailImage({
      coveredCoordinates: trail.coveredCoordinates || [],
      expectedCoordinates: trail.expectedCoordinates || [],
      entryCoord: trail.entryCoord,
      exitCoord: trail.exitCoord,
      width: Math.min(900, trailBox.width * 1.5),
      height: Math.min(520, trailBox.height * 1.5),
    });
  } catch {}

  const imagePad = 8;
  if (trailBuffer) {
    try {
      doc.image(trailBuffer, trailBox.x + imagePad, trailBox.y + imagePad, {
        width: trailBox.width - imagePad * 2,
        height: trailBox.height - imagePad * 2,
      });
    } catch {
      trailBuffer = null;
    }
  }

  if (!trailBuffer) {
    doc.save();
    doc.fillColor('#f4faf7').rect(trailBox.x + 4, trailBox.y + 4, trailBox.width - 8, trailBox.height - 8).fill();
    // Grid lines
    doc.strokeColor('#dde7e0').lineWidth(0.5);
    for (let gx = 1; gx <= 4; gx += 1) {
      const gxPos = trailBox.x + 4 + (gx / 5) * (trailBox.width - 8);
      doc.moveTo(gxPos, trailBox.y + 8).lineTo(gxPos, trailBox.y + trailBox.height - 12).stroke();
    }
    for (let gy = 1; gy <= 3; gy += 1) {
      const gyPos = trailBox.y + 8 + (gy / 4) * (trailBox.height - 20);
      doc.moveTo(trailBox.x + 10, gyPos).lineTo(trailBox.x + trailBox.width - 12, gyPos).stroke();
    }

    const allCoords = [...(trail.expectedCoordinates || []), ...(trail.coveredCoordinates || [])]
      .filter((c) => c && Number.isFinite(c[0]) && Number.isFinite(c[1]));

    if (allCoords.length > 0) {
      const pad = 24;
      const drawArea = { x: trailBox.x + pad, y: trailBox.y + pad, w: trailBox.width - pad * 2, h: trailBox.height - pad * 2 - 20 };
      
      let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
      allCoords.forEach(c => {
        if (c[0] < minLng) minLng = c[0];
        if (c[1] < minLat) minLat = c[1];
        if (c[0] > maxLng) maxLng = c[0];
        if (c[1] > maxLat) maxLat = c[1];
      });
      
      const lngDiff = maxLng - minLng || 0.0001;
      const latDiff = maxLat - minLat || 0.0001;
      const aspectData = lngDiff / latDiff;
      const aspectBox = drawArea.w / drawArea.h;
      
      let scaleX, scaleY;
      if (aspectData > aspectBox) {
        scaleX = drawArea.w / lngDiff;
        scaleY = (drawArea.w / aspectData) / latDiff;
      } else {
        scaleY = drawArea.h / latDiff;
        scaleX = (drawArea.h * aspectData) / lngDiff;
      }
      
      const offsetX = drawArea.x + (drawArea.w - (lngDiff * scaleX)) / 2;
      const offsetY = drawArea.y + (drawArea.h - (latDiff * scaleY)) / 2;
      
      const project = (c) => ({
        x: offsetX + (c[0] - minLng) * scaleX,
        y: offsetY + (latDiff * scaleY) - ((c[1] - minLat) * scaleY)
      });

      doc.save();
      doc.rect(trailBox.x, trailBox.y, trailBox.width, trailBox.height).clip();
      
      const drawPath = (coords, color, width, dash) => {
        if (!coords || !Array.isArray(coords)) return;
        const validCoords = coords.filter((c) => c && Number.isFinite(c[0]) && Number.isFinite(c[1]));
        if (validCoords.length < 2) return;
        
        doc.lineWidth(width).strokeColor(color).lineJoin('round').lineCap('round');
        if (dash) doc.dash(dash[0], { space: dash[1] });
        else doc.undash();
        
        const start = project(validCoords[0]);
        doc.moveTo(start.x, start.y);
        for (let i = 1; i < validCoords.length; i++) {
          const pt = project(validCoords[i]);
          doc.lineTo(pt.x, pt.y);
        }
        doc.stroke();
        doc.undash();
      };
      
      drawPath(trail.expectedCoordinates, COLORS.greyLight, 3, [4, 4]);
      drawPath(trail.coveredCoordinates, COLORS.redSoft, 4);
      
      if (trail.entryCoord) {
        const pt = project(trail.entryCoord);
        doc.fillColor(COLORS.redSoft).circle(pt.x, pt.y, 6).fill();
        doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7).text('•', pt.x - 1.5, pt.y - 3.5);
        doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Entry', pt.x - 12, pt.y - 16);
      }
      if (trail.exitCoord) {
        const pt = project(trail.exitCoord);
        doc.fillColor('#888888').circle(pt.x, pt.y, 6).fill();
        doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Exit', pt.x - 8, pt.y - 16);
      }
      doc.restore();
    } else {
      const lineY = trailBox.y + trailBox.height / 2;
      const entryPoint = { x: trailBox.x + 40, y: lineY };
      const exitPoint = { x: trailBox.x + trailBox.width - 60, y: lineY };
      doc.lineWidth(4).strokeColor(COLORS.redSoft).lineCap('round').moveTo(entryPoint.x, entryPoint.y).lineTo(exitPoint.x, exitPoint.y).stroke();
      doc.dash(4, 4);
      doc.lineWidth(3).moveTo(exitPoint.x, exitPoint.y).lineTo(trailBox.x + trailBox.width - 30, exitPoint.y).stroke();
      doc.undash();
      doc.fillColor(COLORS.redSoft).circle(entryPoint.x, entryPoint.y, 7).fill();
      doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(8).text('•', entryPoint.x - 2, entryPoint.y - 4);
      doc.fillColor('#888888').circle(exitPoint.x, exitPoint.y, 7).fill();
      doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Entry', entryPoint.x - 12, entryPoint.y - 18);
      doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text('Not logged', exitPoint.x - 12, exitPoint.y - 18);
    }
    
    doc.fillColor(COLORS.greyLight).font('Helvetica').fontSize(9).text('N ↑', trailBox.x + trailBox.width - 24, trailBox.y + trailBox.height - 24);

    let label = summary.streetSegment || 'Segment';
    if (label.length > 55) label = label.substring(0, 52) + '...';
    doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(10).text(
      label,
      trailBox.x + 10,
      trailBox.y + trailBox.height - 18,
      { width: trailBox.width - 20, align: 'center', lineBreak: false, height: 12 }
    );
    doc.restore();
  }

  drawLegend(doc, legendBox.x, legendBox.y, legendBox.width, {
    entryTime: trail.entryTime || summary.geofenceEntry,
    exitTime: trail.exitTime || summary.geofenceExit,
    dwellNote: summary.dwellNote || (isFlagged ? 'No exit event — segment flagged' : 'Segment exited after dwell'),
  });

  const caption = trailBuffer
    ? 'Fig. 1 — Segment traced via on-device geofencing. Red solid line: truck path. Dashed: uncovered portion.'
    : 'Fig. 1 — Segment traced via on-device geofencing. Rendered as diagram when map service is unavailable.';
  doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text(caption, trailBox.x, trailBox.y + trailBox.height + 8, { width: trailBox.width });

  doc.page.margins.bottom = originalBottomMargin;
  doc.end();
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
  const trailTimestamps = (Array.isArray(input.trailPoints) ? input.trailPoints : [])
    .map((point) => point.recordedAt)
    .filter(Boolean)
    .sort((a, b) => new Date(a) - new Date(b));
  const firstTrailAt = trailTimestamps[0] || session.startedAt || null;
  const lastTrailAt = trailTimestamps[trailTimestamps.length - 1] || session.endedAt || null;
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
  const collectorSubtitle = [collector.employeeId, collector.location || 'SWMO Naga City'].filter(Boolean).join(' · ');
  const truckAssigned = truck.truckNumber || truck.plateNumber
    ? [`${truck.truckNumber || 'Truck'}${truck.plateNumber ? `  ${truck.plateNumber}` : ''}${truck.color ? ` · ${truck.color}` : ''}`, `Plate No. ${truck.plateNumber || 'Unregistered'}`]
    : 'No truck recorded';
  const shiftStartValue = cycle.shiftStart || session.startedAt || firstCollectedAt;
  const shiftEndValue = cycle.shiftEnd || session.endedAt || lastExitedAt || lastTrailAt;
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
  const coveredCoordinates = trail.coveredCoordinates || input.trailPoints
    ?.filter((p) => Number.isFinite(p.longitude) && Number.isFinite(p.latitude))
    .map((p) => [Number(p.longitude), Number(p.latitude)]) || [];
  const expectedCoordinates = route.routePath && route.routePath.type === 'LineString' && Array.isArray(route.routePath.coordinates)
    ? route.routePath.coordinates
    : route.routePath && route.routePath.type === 'MultiLineString' && Array.isArray(route.routePath.coordinates)
      ? route.routePath.coordinates.flat(1)
      : [];
  const trailPoints = coveredCoordinates;
  const entryCoord = trailPoints[0] || null;
  const exitCoord = trailPoints[trailPoints.length - 1] || null;

  const reportDate = manilaDateShort(eventDate.length === 10 && /^\d/.test(eventDate) ? new Date(`${eventDate}T00:00:00`) : new Date());
  const exportedAt = manilaDateTime(new Date());
  const adminName = adminUser?.name ? `Admin — ${adminUser.name}, SWMO` : 'Admin — SWMO';

  return {
    recordSummary: {
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
      coveredCoordinates,
      expectedCoordinates,
      entryCoord,
      exitCoord,
      entryTime: firstCollectedAt,
      exitTime: lastExitedAt,
    },
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
