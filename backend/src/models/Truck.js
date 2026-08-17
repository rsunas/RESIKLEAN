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
    length: { type: Number, required: [true, 'Length is required'] },
    width:  { type: Number, required: [true, 'Width is required'] },
    height: { type: Number, required: [true, 'Height is required'] },
    registeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Truck', truckSchema);
