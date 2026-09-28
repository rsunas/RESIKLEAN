const mongoose = require('mongoose');

/**
 * Truck — fleet registry for the sanitary landfill.
 * Admin creates trucks; Staff selects from this list
 * when logging a TruckLoad (volumetric input).
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
    truckColor: {
      type: String,
      required: [true, 'Truck color is required'],
      trim: true,
    },
    capacityKg: {
      type: Number,
      required: [true, 'Capacity (kg) is required'],
      min: [0.01, 'Capacity must be a positive number'],
    },
    length: { type: Number, required: [true, 'Length is required'], min: [0.01, 'Length must be positive'] },
    width:  { type: Number, required: [true, 'Width is required'],  min: [0.01, 'Width must be positive'] },
    height: { type: Number, required: [true, 'Height is required'], min: [0.01, 'Height must be positive'] },
    isActive: { type: Boolean, default: true },
    removedAt: { type: Date, default: null },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Truck', truckSchema);
