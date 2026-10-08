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
    // Stable client-generated key used to make offline retries idempotent.
    // Sparse keeps existing records valid while enforcing uniqueness on new submissions.
    clientSubmissionId: { type: String, index: true, unique: true, sparse: true },
    truckPlate: { type: String, required: true },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route' },
    // Triangulation measurements (metres)
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
    photoUrl: { type: String },                         // Legacy: single Cloudinary URL for audit photo
    sidePhotoUrl: { type: String },                     // Cloudinary URL for side photo
    backPhotoUrl: { type: String },                     // Cloudinary URL for back photo
    sidePhotoMetadata: { type: Object, default: {} },   // Metadata for side photo
    backPhotoMetadata: { type: Object, default: {} },   // Metadata for back photo
  },
  { timestamps: true }
);

// Auto-calculate volume and tonnage before saving
truckLoadSchema.pre('save', function (next) {
  // Truck dimensions are already stored in metres.
  this.volumeCubicM = this.length * this.width * this.height;
  // Apply slope correction (slope is already in m³)
  const adjustedVolume = this.volumeCubicM + (this.slope || 0);
  // Snapshot the density factor and calculate tonnage
  this.densityFactor = this.densityFactor || DEFAULT_DENSITY_FACTOR;
  this.tonnesEstimate = adjustedVolume * this.densityFactor;
  next();
});

module.exports = mongoose.model('TruckLoad', truckLoadSchema);

