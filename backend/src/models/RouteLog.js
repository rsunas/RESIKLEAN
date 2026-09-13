const mongoose = require('mongoose');

const DWELL_THRESHOLD_SECONDS = 30; // SWMO Garbage Collection Scheme minimum

/**
 * RouteLog — created on geofence exit when a collector finishes a stop.
 * collectedAt = geofence entry time, exitedAt = geofence exit time.
 * dwellSeconds is computed server-side; flaggedForReview is auto-set
 * when dwell time falls below the SWMO threshold.
 * eventDate is the Manila-local date string (YYYY-MM-DD) derived from collectedAt,
 * used in the compound unique index for atomic duplicate prevention.
 */
const routeLogSchema = new mongoose.Schema(
  {
    clientId:         { type: String },                     // UUID from device for offline dedup
    routeId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true },
    collectorId:      { type: mongoose.Schema.Types.ObjectId, ref: 'User',  required: true },
    stopId:           { type: mongoose.Schema.Types.ObjectId, required: true },
    eventDate:        { type: String, required: true },     // YYYY-MM-DD (Manila TZ) — derived from collectedAt
    collectedAt:      { type: Date, required: true },       // geofence entry timestamp
    exitedAt:         { type: Date },                       // geofence exit timestamp
    dwellSeconds:     { type: Number, default: 0 },         // computed server-side: exitedAt - collectedAt
    latitude:         { type: Number },
    longitude:        { type: Number },
    status:           { type: String, enum: ['collected'], default: 'collected' },  // Auto-set by server; no manual override
    flaggedForReview: { type: Boolean, default: false },     // true when dwellSeconds < SWMO threshold
  },
  { timestamps: true }
);

// Unique sparse index — only one log per clientId, but allows null/missing
routeLogSchema.index({ clientId: 1 }, { unique: true, sparse: true });

// Atomic duplicate prevention: one log per stop per collector per calendar day.
// The database enforces this — no race condition possible on offline retry.
routeLogSchema.index({ stopId: 1, collectorId: 1, eventDate: 1 }, { unique: true });

// Export the threshold so the controller can use it
routeLogSchema.statics.DWELL_THRESHOLD_SECONDS = DWELL_THRESHOLD_SECONDS;

module.exports = mongoose.model('RouteLog', routeLogSchema);

