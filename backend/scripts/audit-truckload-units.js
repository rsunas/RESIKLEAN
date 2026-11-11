// READ ONLY. Run from backend: node scripts/audit-truckload-units.js
// No models, hooks, migrations, updates or index creation are used.
require('dotenv').config();
const dns = require('node:dns');
const mongoose = require('mongoose');
// Optional process-local DNS override for environments with broken SRV lookup.
if (process.env.AUDIT_DNS_SERVERS) dns.setServers(process.env.AUDIT_DNS_SERVERS.split(','));

async function audit() {
  await mongoose.connect(process.env.MONGODB_URI, { autoIndex: false, serverSelectionTimeoutMS: 15000 });
  try {
    const records = await mongoose.connection.db.collection('truckloads').find({}, {
      projection: { _id: 1, staffId: 1, truckPlate: 1, arrivedAt: 1, createdAt: 1, length: 1, width: 1, height: 1, slope: 1, densityFactor: 1, volumeCubicM: 1, tonnesEstimate: 1 },
    }).sort({ tonnesEstimate: -1, _id: 1 }).toArray();
    const rows = records.map((record) => {
      const savedDensity = Number(record.densityFactor);
      const density = Number.isFinite(savedDensity) && savedDensity > 0 ? savedDensity : 0.294;
      const savedSlope = Number(record.slope || 0);
      const slope = Number.isFinite(savedSlope) ? savedSlope : 0;
      const volume = Number(record.length) * Number(record.width) * Number(record.height);
      const uiTonnes = Number.isFinite(volume) && volume > 0 ? (volume + slope) * density : 0;
      const reasons = [];
      for (const [field, min, max] of [['length', 1, 12], ['width', 1, 3], ['height', 0.3, 4]]) {
        if (!Number.isFinite(Number(record[field])) || Number(record[field]) < min || Number(record[field]) > max) reasons.push(`${field} outside ${min}-${max} m`);
      }
      if (record.tonnesEstimate == null || Math.abs(Number(record.tonnesEstimate) - uiTonnes) > 0.000001) reasons.push('stored/display tonnage mismatch');
      return { ...record, slope: record.slope ?? null, densityFactor: record.densityFactor ?? null, uiTonnes, reasons };
    });
    rows.sort((a, b) => b.uiTonnes - a.uiTonnes);
    const totals = {};
    for (const row of rows) {
      const staffId = String(row.staffId);
      const total = totals[staffId] || (totals[staffId] = { count: 0, uiTonnes: 0 });
      total.count++;
      total.uiTonnes += row.uiTonnes;
    }
    const trucks = await mongoose.connection.db.collection('trucks').find({}, {
      projection: { _id: 1, plateNumber: 1, length: 1, width: 1, height: 1, createdAt: 1, updatedAt: 1 },
    }).sort({ plateNumber: 1 }).toArray();
    console.log(JSON.stringify({ recordCount: rows.length, sortedBy: 'uiTonnes descending (same metre formula as Staff History/Profile)', rows, totals, trucks }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
audit().catch((error) => {
  // Do not print connection strings or error messages containing credentials.
  console.error(JSON.stringify({ name: error.name, code: error.code, syscall: error.syscall }));
  process.exitCode = 1;
});
