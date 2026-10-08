const path = require('path');
const fs = require('fs');

const LOGO_PATH = path.resolve(__dirname, '../../../assets/swmo-resiklean-logo.png');

const COLORS = {
  tealDark: '#07815f',
  tealLight: '#14a87d',
  tealBg: '#EBF7F5',
  tealBorder: '#9bc6ad',
  grey: '#65766c',
  greyLight: '#a3b0a8',
  dark: '#20372a',
  tableBorder: '#d9e4de',
  rule: '#0f6e53',
};

function drawTwoPartRule(doc, x, y, width) {
  doc.save();
  doc.lineWidth(3).strokeColor(COLORS.tealLight).moveTo(x, y).lineTo(x + width, y).stroke();
  doc.lineWidth(1).strokeColor(COLORS.rule).moveTo(x, y + 2).lineTo(x + width, y + 2).stroke();
  doc.restore();
}

function drawKpiCard(doc, x, y, width, height, title, value) {
  doc.save();
  doc.fillColor('#F9FAFB').roundedRect(x, y, width, height, 6).fill();
  doc.lineWidth(1).strokeColor(COLORS.tableBorder).roundedRect(x, y, width, height, 6).stroke();
  
  doc.fillColor(COLORS.grey).font('Helvetica-Bold').fontSize(10).text(title, x + 10, y + 12, { width: width - 20 });
  if (typeof value === 'object' && value.text && value.sub) {
    doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(22).text(value.text, x + 10, y + 30);
    doc.fillColor(COLORS.grey).font('Helvetica').fontSize(9).text(value.sub, x + 10, y + 54);
  } else {
    doc.fillColor(COLORS.tealDark).font('Helvetica-Bold').fontSize(22).text(value, x + 10, y + 30);
  }
  doc.restore();
}

function drawTrendChart(doc, x, y, width, height, chartData) {
  doc.save();
  // Background
  doc.fillColor('#FFFFFF').roundedRect(x, y, width, height, 6).fill();
  doc.lineWidth(1).strokeColor(COLORS.tableBorder).roundedRect(x, y, width, height, 6).stroke();
  
  // Title
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(12).text('Tonnage Trend', x + 14, y + 14);

  const chartX = x + 40;
  const chartY = y + 40;
  const chartW = width - 60;
  const chartH = height - 70;

  if (!chartData || chartData.length === 0) {
    doc.fillColor(COLORS.grey).font('Helvetica').fontSize(10).text('No data available in this range.', chartX, chartY + chartH / 2, { align: 'center', width: chartW });
    doc.restore();
    return;
  }

  // Find max for Y axis
  let maxTonnage = 0;
  chartData.forEach(d => {
    if (d.tonnage > maxTonnage) maxTonnage = d.tonnage;
  });
  if (maxTonnage === 0) maxTonnage = 10;
  
  // Draw Y axis lines
  const steps = 4;
  for (let i = 0; i <= steps; i++) {
    const yPos = chartY + chartH - (i / steps) * chartH;
    const val = (maxTonnage * (i / steps)).toFixed(1);
    doc.lineWidth(0.5).strokeColor('#E5E7EB').moveTo(chartX, yPos).lineTo(chartX + chartW, yPos).stroke();
    doc.fillColor(COLORS.greyLight).font('Helvetica').fontSize(8).text(val + 't', chartX - 30, yPos - 4, { width: 26, align: 'right' });
  }

  // Draw Line
  doc.lineWidth(2).strokeColor(COLORS.tealLight);
  const stepX = chartData.length > 1 ? chartW / (chartData.length - 1) : chartW;
  
  let prevX = chartX;
  let prevY = chartY + chartH - (chartData[0].tonnage / maxTonnage) * chartH;
  
  for (let i = 0; i < chartData.length; i++) {
    const curX = chartX + (i * stepX);
    const curY = chartY + chartH - (chartData[i].tonnage / maxTonnage) * chartH;
    
    if (i === 0) {
      doc.moveTo(curX, curY);
    } else {
      doc.lineTo(curX, curY);
    }
  }
  doc.stroke();

  // Draw points and labels
  for (let i = 0; i < chartData.length; i++) {
    const curX = chartX + (i * stepX);
    const curY = chartY + chartH - (chartData[i].tonnage / maxTonnage) * chartH;
    
    // Circle
    doc.circle(curX, curY, 4).fillAndStroke('#FFFFFF', COLORS.tealDark);
    
    // X label (every Nth label if too many)
    if (chartData.length <= 15 || i % Math.ceil(chartData.length / 10) === 0) {
      const dateParts = chartData[i].date.split('-');
      const shortDate = `${dateParts[1]}/${dateParts[2]}`; // MM/DD
      doc.fillColor(COLORS.greyLight).font('Helvetica').fontSize(8).text(shortDate, curX - 15, chartY + chartH + 8, { width: 30, align: 'center' });
    }
  }

  doc.restore();
}

function drawSimpleTable(doc, x, y, width, headers, rows, colWidths) {
  let cursorY = y;
  
  // Top green border
  doc.lineWidth(3).strokeColor(COLORS.tealDark).moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
  cursorY += 8;

  // Header row
  doc.fillColor(COLORS.grey).font('Helvetica-Bold').fontSize(9);
  let currentX = x;
  headers.forEach((h, i) => {
    doc.text(h.toUpperCase(), currentX, cursorY, { width: colWidths[i], align: 'left' });
    currentX += colWidths[i];
  });
  cursorY += 14;
  doc.lineWidth(1).strokeColor(COLORS.tableBorder).moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
  cursorY += 6;

  // Data rows
  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, rIdx) => {
    // Page break logic if needed
    if (cursorY > doc.page.height - 80) {
      doc.addPage();
      cursorY = 50;
      doc.lineWidth(3).strokeColor(COLORS.tealDark).moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
      cursorY += 8;
      doc.fillColor(COLORS.grey).font('Helvetica-Bold').fontSize(9);
      let cx = x;
      headers.forEach((h, i) => {
        doc.text(h.toUpperCase(), cx, cursorY, { width: colWidths[i], align: 'left' });
        cx += colWidths[i];
      });
      cursorY += 14;
      doc.lineWidth(1).strokeColor(COLORS.tableBorder).moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
      cursorY += 6;
      doc.font('Helvetica').fontSize(9);
    }

    currentX = x;
    let maxH = 0;
    row.forEach((val, i) => {
      doc.fillColor(COLORS.dark);
      const str = String(val);
      const h = doc.heightOfString(str, { width: colWidths[i] - 5 });
      if (h > maxH) maxH = h;
      doc.text(str, currentX, cursorY, { width: colWidths[i] - 5, align: 'left' });
      currentX += colWidths[i];
    });
    cursorY += maxH + 4;
    doc.lineWidth(0.5).strokeColor('#F3F4F6').moveTo(x, cursorY).lineTo(x + width, cursorY).stroke();
    cursorY += 4;
  });

  return cursorY;
}

async function generateTonnageTrendPDF(doc, data, dateRangeStr) {
  const pageWidth = doc.page.width;
  const margin = 46;
  const contentWidth = pageWidth - margin * 2;

  doc.info.Title = `Tonnage Trend Report`;
  doc.info.Author = 'ResiKlean — Naga City SWMO';

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
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(26).text('Tonnage Trend Report', margin, cursorY + 24, { width: contentWidth, align: 'right' });
  doc.fillColor(COLORS.grey).font('Helvetica-Oblique').fontSize(10).text(`Date Range: ${dateRangeStr}`, margin, cursorY + 44, { width: contentWidth, align: 'right' });

  cursorY = margin + 82;
  drawTwoPartRule(doc, margin, cursorY, contentWidth);
  cursorY += 20;

  // ── KPI Cards ─────────────────────────────────────────────────────────
  const kpiW = (contentWidth - 30) / 4;
  const kpiH = 76;
  
  drawKpiCard(doc, margin, cursorY, kpiW, kpiH, 'Total Tonnage', `${(data.summary.totalTonnage || 0).toFixed(2)} t`);
  drawKpiCard(doc, margin + kpiW + 10, cursorY, kpiW, kpiH, 'Daily Average', `${(data.summary.dailyAverage || 0).toFixed(2)} t/day`);
  drawKpiCard(doc, margin + (kpiW + 10) * 2, cursorY, kpiW, kpiH, 'Peak Day', data.summary.peakDay ? {
    text: `${data.summary.peakDay.tonnage.toFixed(2)} t`,
    sub: data.summary.peakDay.date
  } : 'N/A');
  drawKpiCard(doc, margin + (kpiW + 10) * 3, cursorY, kpiW, kpiH, 'Truck Loads', String(data.summary.truckLoads || 0));

  cursorY += kpiH + 20;

  // ── Trend Chart ───────────────────────────────────────────────────────
  drawTrendChart(doc, margin, cursorY, contentWidth, 200, data.chartData);
  cursorY += 220;

  if (cursorY > doc.page.height - 150) {
    doc.addPage();
    cursorY = margin;
  }

  // ── Daily Breakdown Table ─────────────────────────────────────────────
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('Daily Breakdown', margin, cursorY);
  cursorY += 20;
  
  const dailyHeaders = ['Date', 'Truck Loads', 'Total Tonnage', 'Avg per Load'];
  const dailyWidths = [120, 100, 100, contentWidth - 320];
  const dailyRows = data.dailyBreakdown.map(d => [
    d.date, 
    d.truckLoads, 
    `${d.totalTonnage.toFixed(2)} t`, 
    `${d.avgPerLoad.toFixed(2)} t`
  ]);
  
  cursorY = drawSimpleTable(doc, margin, cursorY, contentWidth, dailyHeaders, dailyRows, dailyWidths);
  cursorY += 30;

  if (cursorY > doc.page.height - 150) { doc.addPage(); cursorY = margin; }

  // ── Collection by Area ────────────────────────────────────────────────
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('Collection by Area', margin, cursorY);
  cursorY += 20;
  
  const areaHeaders = ['Area', 'Barangays', 'Truck Loads', 'Tonnage', 'Share'];
  const areaWidths = [120, 160, 70, 70, contentWidth - 420];
  const areaRows = data.collectionByArea.map(a => [
    a.area, 
    a.barangays || '—',
    a.truckLoads,
    `${a.tonnage.toFixed(2)} t`,
    `${a.share.toFixed(1)}%`
  ]);
  cursorY = drawSimpleTable(doc, margin, cursorY, contentWidth, areaHeaders, areaRows, areaWidths);
  cursorY += 30;

  if (cursorY > doc.page.height - 150) { doc.addPage(); cursorY = margin; }

  // ── Submissions by Staff ──────────────────────────────────────────────
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('Submissions by Staff', margin, cursorY);
  cursorY += 20;
  
  const staffHeaders = ['Staff Name', 'Area', 'Loads Submitted', 'Total Tonnage'];
  const staffWidths = [160, 160, 100, contentWidth - 420];
  const staffRows = data.submissionsByStaff.map(s => [
    s.staff,
    s.area,
    s.loads,
    `${s.tonnage.toFixed(2)} t`
  ]);
  cursorY = drawSimpleTable(doc, margin, cursorY, contentWidth, staffHeaders, staffRows, staffWidths);
  cursorY += 30;

  if (cursorY > doc.page.height - 150) { doc.addPage(); cursorY = margin; }

  // ── Truck Load Log ────────────────────────────────────────────────────
  doc.fillColor(COLORS.dark).font('Helvetica-Bold').fontSize(14).text('Truck Load Log', margin, cursorY);
  cursorY += 20;
  
  const logHeaders = ['Date/Time', 'Plate No.', 'Area', 'Staff', 'Vol (m³)', 'Tonnage', 'Audit'];
  const logWidths = [90, 60, 80, 80, 50, 50, contentWidth - 410];
  const logRows = data.loadLogs.map(l => [
    l.datetime,
    l.plateNo,
    l.area,
    l.staff,
    l.volInclSlope.toFixed(2),
    `${l.tonnage.toFixed(2)} t`,
    l.auditAttached ? 'Photo Attached' : 'No Photo'
  ]);
  cursorY = drawSimpleTable(doc, margin, cursorY, contentWidth, logHeaders, logRows, logWidths);
  cursorY += 50;

  // ── Signature Block ───────────────────────────────────────────────────
  if (cursorY > doc.page.height - 120) { doc.addPage(); cursorY = margin + 20; }
  
  doc.fillColor(COLORS.dark).font('Helvetica').fontSize(10).text('Generated By:', margin, cursorY);
  doc.moveTo(margin + 80, cursorY + 12).lineTo(margin + 200, cursorY + 12).lineWidth(1).strokeColor(COLORS.dark).stroke();
  doc.text('Signature over printed name', margin + 80, cursorY + 16, { width: 120, align: 'center' });
}

module.exports = {
  generateTonnageTrendPDF
};
