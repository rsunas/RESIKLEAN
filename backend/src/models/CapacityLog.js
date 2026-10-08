const mongoose = require('mongoose');

const capacityLogSchema = new mongoose.Schema(
  {
    clientId: {
      type: String,
      required: true,
      unique: true,
    },
    driver: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    truck: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Truck',
      required: true,
    },
    dailyCycle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DailyCycleLog',
      required: true,
    },
    route: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Route',
      required: true,
    },
    fillLevel: {
      type: Number,
      required: true,
      min: 10,
      max: 100,
      validate: {
        validator: Number.isInteger,
        message: '{VALUE} is not an integer value',
      },
    },
    snapshot: {
      completedStops: { type: Number, required: true },
      totalStops: { type: Number, required: true },
    },
    calculated: {
      volume: { type: Number, required: true },
      tonnage: { type: Number, required: true },
    },
    timestamp: {
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
capacityLogSchema.index({ dailyCycle: 1, timestamp: -1 });
capacityLogSchema.index({ driver: 1, timestamp: -1 });

module.exports = mongoose.model('CapacityLog', capacityLogSchema);
