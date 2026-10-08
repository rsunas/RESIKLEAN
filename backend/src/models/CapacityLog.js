const mongoose = require('mongoose');

const capacityLogSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['log', 'reset'], default: 'log' },
    clientId: {
      type: String,
      required: true,
      unique: true,
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    truckId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Truck',
      required: true,
    },
    cycleLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DailyCycleLog',
      required: true,
    },
    routeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
    fillLevelPct: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
    stopsCompleted: { type: Number, required: true, min: 0 },
    totalStops: { type: Number, required: true, min: 0 },
    estimatedVolumeM3: { type: Number, required: true, min: 0 },
    estimatedTonnage: { type: Number, required: true, min: 0 },
    loggedAt: {
      type: Date,
      default: Date.now,
    },
    dataSource: {
      type: String,
      enum: ['real', 'seed'],
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes to speed up queries
capacityLogSchema.index({ cycleLogId: 1, loggedAt: -1 });
capacityLogSchema.index({ driverId: 1, loggedAt: -1 });

module.exports = mongoose.model('CapacityLog', capacityLogSchema);
