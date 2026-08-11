const mongoose = require('mongoose');

/**
 * RouteLog — created automatically when a collector's device
 * detects a geofence entry at a stop (offline-first, synced later).
 */
const routeLogSchema = new mongoose.Schema(
  {
    routeId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    stopId:      { type: mongoose.Schema.Types.ObjectId, required: true },
    collectedAt: { type: Date, required: true },   // timestamp from device (may differ from createdAt)
    latitude:    { type: Number },
    longitude:   { type: Number },
    status:      { type: String, enum: ['collected', 'skipped'], default: 'collected' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('RouteLog', routeLogSchema);
