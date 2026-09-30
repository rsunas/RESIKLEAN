const mongoose = require('mongoose');

/**
 * Truck — fleet registry for the sanitary landfill.
 * Admin creates trucks; Staff selects from this list
 * when logging a TruckLoad (volumetric input).
 *
 * Dimensions are stored in METERS.
 * Capacity (cubic meters) is computed automatically as length × width × height.
 */
const truckSchema = new mongoose.Schema(
  {
    plateNumber: {
      type: String,
      required: [true, 'Plate number is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    truckNumber: {
      type: String,
      required: [true, 'Truck number is required'],
      unique: true,
      trim: true,
    },
    color: {
      type: String,
      required: [true, 'Color is required'],
      trim: true,
    },
    // Dimensions in meters
    length: {
      type: Number,
      required: [true, 'Length (m) is required'],
      min: [0.01, 'Length must be a positive number'],
    },
    width: {
      type: Number,
      required: [true, 'Width (m) is required'],
      min: [0.01, 'Width must be a positive number'],
    },
    height: {
      type: Number,
      required: [true, 'Height (m) is required'],
      min: [0.01, 'Height must be a positive number'],
    },
    availability: {
      type: String,
      enum: ['available', 'unavailable'],
      default: 'available',
    },
    isActive: { type: Boolean, default: true },
    removedAt: { type: Date, default: null },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Virtual: capacity (cu.m.) — read-only, computed from dimensions.
 * Returned with two decimal places.
 */
truckSchema.virtual('capacity').get(function () {
  if (this.length != null && this.width != null && this.height != null) {
    return +(this.length * this.width * this.height).toFixed(2);
  }
  return null;
});

module.exports = mongoose.model('Truck', truckSchema);
