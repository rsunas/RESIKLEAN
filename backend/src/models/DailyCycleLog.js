const mongoose = require('mongoose');

/**
 * DailyCycleLog — maps a specific driver (Collector) to a
 * specific truck for one shift.  Created when the Admin assigns
 * a driver to a truck or when a Collector clocks in.
 *
 * Staff can query this to find out which driver is currently
 * assigned to the truck that just arrived at the landfill.
 */
const dailyCycleLogSchema = new mongoose.Schema(
  {
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Driver (Collector) is required'],
    },
    truckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Truck',
      required: [true, 'Truck is required'],
    },
    shiftStart: {
      type: Date,
      required: [true, 'Shift start time is required'],
    },
    shiftEnd: {
      type: Date,
      default: null,
    },
    shiftStatus: {
      type: String,
      enum: ['active', 'completed', 'cancelled'],
      default: 'active',
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('DailyCycleLog', dailyCycleLogSchema);
