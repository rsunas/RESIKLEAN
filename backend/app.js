require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { errorHandler } = require('./src/middlewares/errorHandler');

const authRoutes               = require('./src/routes/auth.routes');
const residentRoutes           = require('./src/routes/resident.routes');
const collectorRoutes          = require('./src/routes/collector.routes');
const staffRoutes              = require('./src/routes/staff.routes');
const adminRoutes              = require('./src/routes/admin.routes');
const truckRoutes              = require('./src/routes/truck.routes');
const collectionLocationRoutes = require('./src/routes/collectionLocation.routes');

const app = express();

// ── Global Middleware ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ── Health Check ──────────────────────────────────────────────────────────────
app.get('/', (req, res) =>
  res.json({ message: '✅ Resiklean API is running', version: '1.0.0' })
);

app.get('/api/health', (req, res) =>
  res.json({ status: 'ok', message: '✅ Resiklean API is healthy', timestamp: new Date() })
);

// ── API Routes ────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/resident', residentRoutes);
app.use('/api/collector', collectorRoutes);
app.use('/api/staff', staffRoutes);
const announcementRoutes = require('./src/routes/announcement.routes');
app.use('/api/admin/announcements', announcementRoutes.admin);
app.use('/api/announcements', announcementRoutes.resident);
app.use('/api/admin', adminRoutes);
app.use('/api/trucks', truckRoutes);
app.use('/api/collection-locations', collectionLocationRoutes);

// ── Global Error Handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

module.exports = app;
