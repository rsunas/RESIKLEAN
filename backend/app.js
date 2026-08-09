require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const { errorHandler } = require('./middlewares/errorHandler');

const authRoutes      = require('./routes/auth.routes');
const residentRoutes  = require('./routes/resident.routes');
const collectorRoutes = require('./routes/collector.routes');
const staffRoutes     = require('./routes/staff.routes');
const adminRoutes     = require('./routes/admin.routes');

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
app.use('/api/auth',      authRoutes);
app.use('/api/resident',  residentRoutes);
app.use('/api/collector', collectorRoutes);
app.use('/api/staff',     staffRoutes);
app.use('/api/admin',     adminRoutes);

// ── Global Error Handler (must be last) ───────────────────────────────────────
app.use(errorHandler);

module.exports = app;
