const mongoose = require('mongoose');

/**
 * TruckLoad — submitted by Staff at the sanitary landfill.
 * Tonnage is calculated from triangulation measurements.
 */
const truckLoadSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    truckPlate: { type: String, required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    // Triangulation measurements (cm or m — agree on unit per sprint)
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    // Calculated tonnage (stored for reporting)
    volumeCubicM: { type: Number },
    tonnesEstimate: { type: Number },
    arrivedAt: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    photoUrl: { type: String, required: true },         // Cloudinary URL for audit photo
  },
  { timestamps: true }
);

// Auto-calculate volume before saving
truckLoadSchema.pre('save', function (next) {
  this.volumeCubicM = (this.length * this.width * this.height) / 1_000_000; // cm³ → m³
  this.tonnesEstimate = this.volumeCubicM * 0.3; // rough density of MSW (tonnes/m³)
  next();
});

module.exports = mongoose.model('TruckLoad', truckLoadSchema);
