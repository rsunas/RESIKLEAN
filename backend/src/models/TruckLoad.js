const mongoose = require('mongoose');

// Default MSW density: 294 kg/m³ = 0.294 tonnes/m³
const DEFAULT_DENSITY_FACTOR = 0.294;

/**
 * TruckLoad — submitted by Staff at the sanitary landfill.
 * Tonnage is calculated from triangulation measurements.
 * Formula: Total Tonnage = (L × W × H + Slope) × density
 */
const truckLoadSchema = new mongoose.Schema(
  {
    staffId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    truckPlate: { type: String, required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    // Triangulation measurements (centimetres)
    length: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    slope: { type: Number, default: 0 },
    // Calculated tonnage (stored for reporting)
    volumeCubicM: { type: Number },
    tonnesEstimate: { type: Number },
    // Snapshot of the density factor used for this record
    densityFactor: { type: Number, default: DEFAULT_DENSITY_FACTOR },
    arrivedAt: { type: Date, default: Date.now },
    notes: { type: String, default: '' },
    photoUrl: { type: String, required: true },         // Cloudinary URL for audit photo
  },
  { timestamps: true }
);

// Auto-calculate volume and tonnage before saving
truckLoadSchema.pre('save', function (next) {
  // cm³ → m³ (division by 1,000,000)
  this.volumeCubicM = (this.length * this.width * this.height) / 1_000_000;
  // Apply slope correction (slope is already in m³)
  const adjustedVolume = this.volumeCubicM + (this.slope || 0);
  // Snapshot the density factor and calculate tonnage
  this.densityFactor = this.densityFactor || DEFAULT_DENSITY_FACTOR;
  this.tonnesEstimate = adjustedVolume * this.densityFactor;
  next();
});

module.exports = mongoose.model('TruckLoad', truckLoadSchema);

