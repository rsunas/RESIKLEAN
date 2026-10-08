const mongoose = require('mongoose');

const routeTrailPointSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true, index: true },
    clientSessionId: { type: String, required: true, index: true },
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', required: true, index: true },
    routeName: { type: String, required: true },
    recordedAt: { type: Date, required: true, index: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    accuracyMeters: { type: Number, min: 0 },
    altitudeMeters: { type: Number },
    headingDegrees: { type: Number },
    speedMetersPerSecond: { type: Number },
  },
  { timestamps: true },
);

routeTrailPointSchema.index({ clientSessionId: 1, recordedAt: 1 }, { unique: true });
routeTrailPointSchema.index({ collectorId: 1, routeId: 1, recordedAt: 1 });

module.exports = mongoose.model('RouteTrailPoint', routeTrailPointSchema);
