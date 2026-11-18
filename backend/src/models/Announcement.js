const mongoose = require('mongoose');
const { types, reasons, impacts } = require('../shared/announcements.json');
const schema = new mongoose.Schema({
  type: { type: String, enum: types, required: true },
  reason: { type: String, enum: reasons, required: true },
  areaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Route', default: null }, // null = all areas
  areaLabel: { type: String, required: true },
  audienceBarangays: [String],
  affectedTruckId: { type: mongoose.Schema.Types.ObjectId, ref: 'Truck', default: null },
  scheduledFor: { type: Date, required: true },
  newDate: { type: String, default: null },
  impact: { type: String, enum: impacts, required: true },
  message: { type: String, maxlength: 500, default: '' },
  imageUrl: String,
  imagePublicId: String,
  status: { type: String, enum: ['draft', 'published'], default: 'draft' },
  publishedAt: Date,
  notifiedAt: Date,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  requestKey: { type: String, required: true },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ createdBy: 1, requestKey: 1 }, { unique: true });
schema.index({ status: 1, publishedAt: -1 });
module.exports = mongoose.model('Announcement', schema);
