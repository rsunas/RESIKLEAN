const mongoose = require('mongoose');
const schema = new mongoose.Schema({
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: String, required: true },
  readAt: { type: Date, default: Date.now },
});
schema.index({ adminId: 1, eventId: 1 }, { unique: true });
module.exports = mongoose.model('AdminNotificationRead', schema);
