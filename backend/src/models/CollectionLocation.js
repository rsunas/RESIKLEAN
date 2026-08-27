const mongoose = require('mongoose');

const scheduleEntrySchema = new mongoose.Schema(
  {
    wasteType:   { type: String, enum: ['biodegradable', 'non-biodegradable'], required: true },
    days:        [{ type: String, enum: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'] }],
    timeWindows: [{ type: String }],  // e.g. "4:00 AM–8:00 AM"
  },
  { _id: false }
);

const collectionLocationSchema = new mongoose.Schema(
  {
    name:      { type: String, required: true, trim: true, unique: true },
    area:      { type: String, required: true, trim: true },
    type:      { type: String, enum: ['barangay', 'street', 'subdivision', 'cbd', 'landmark'], default: 'barangay' },
    schedules: [scheduleEntrySchema],
    shift:     { type: String, enum: ['day', 'night'], default: 'day' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('CollectionLocation', collectionLocationSchema);
