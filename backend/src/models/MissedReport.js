const mongoose = require('mongoose');

/**
 * MissedReport — submitted by a Resident when their scheduled
 * collection did not happen. Photo is AI-verified by Roboflow.
 */
const missedReportSchema = new mongoose.Schema(
  {
    residentId:   { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    barangay:     { type: String, required: true },
    description:  { type: String, default: '' },
    photoUrl:     { type: String },                        // Cloudinary URL
    aiVerified:   { type: Boolean, default: false },       // Roboflow result
    aiConfidence: { type: Number },                        // 0–1
    detectedBagCount: { type: Number, default: 0 },        // Count of detected waste bags
    status:       {
      type: String,
      enum: ['pending', 'verified', 'scheduled', 'rejected', 'resolved'],
      default: 'pending',
    },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MissedReport', missedReportSchema);
