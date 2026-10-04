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
    photoMetadata: {
      capturedAt: { type: Date },                          // Device timestamp when photo was taken
      latitude:   { type: Number },                        // GPS lat (nullable if permission denied)
      longitude:  { type: Number },                        // GPS lng
      accuracy:   { type: Number },                        // GPS accuracy in metres
      width:      { type: Number },                        // Image width in px
      height:     { type: Number },                        // Image height in px
      fileSize:   { type: Number },                        // File size in bytes
      mimeType:   { type: String },                        // e.g. "image/jpeg"
    },
    aiVerified:   { type: Boolean, default: false },       // Roboflow result
    aiConfidence: { type: Number },                        // 0–1
    detectedBagCount: { type: Number, default: 0 },        // Count of detected waste bags
    status:       {
      type: String,
      enum: ['pending', 'verified', 'scheduled', 'rejected', 'resolved'],
      default: 'pending',
    },
    resolutionPhotoUrl: { type: String }, // Cloudinary URL for proof photo
    resolutionPhotoMetadata: {
      capturedAt: { type: Date },
      latitude:   { type: Number },
      longitude:  { type: Number },
      accuracy:   { type: Number },
      width:      { type: Number },
      height:     { type: Number },
      fileSize:   { type: Number },
      mimeType:   { type: String },
    },
    resolutionNote: { type: String },
    resolutionClientId: { type: String }, // For idempotent offline retries
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('MissedReport', missedReportSchema);

