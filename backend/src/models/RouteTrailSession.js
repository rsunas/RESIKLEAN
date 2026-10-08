const mongoose = require('mongoose');

const routeTrailSessionSchema = new mongoose.Schema(
  {
    clientSessionId: { type: String, required: true, unique: true, index: true },
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    routeName: { type: String, required: true },
    startedAt: { type: Date, required: true },
    endedAt: { type: Date },
    status: { type: String, enum: ['active', 'completed'], default: 'active' },
    pointCount: { type: Number, default: 0 },
    lastSyncedAt: { type: Date },
    remarks: { type: String },
  },
  { timestamps: true },
);

routeTrailSessionSchema.index({ collectorId: 1, startedAt: -1 });

module.exports = mongoose.model('RouteTrailSession', routeTrailSessionSchema);
