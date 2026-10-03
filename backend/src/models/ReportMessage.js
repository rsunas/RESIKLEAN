const mongoose = require('mongoose');

/**
 * ReportMessage — persistent two-way chat message attached to a
 * MissedReport.  Both Residents and Admins can read and send messages
 * on a report they have access to.
 */
const reportMessageSchema = new mongoose.Schema(
  {
    reportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MissedReport',
      required: [true, 'reportId is required'],
      index: true,
    },
    senderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'senderId is required'],
    },
    senderRole: {
      type: String,
      enum: ['resident', 'admin'],
      required: [true, 'senderRole is required'],
    },
    body: {
      type: String,
      required: [true, 'Message body is required'],
      maxlength: [1000, 'Message must be 1000 characters or fewer'],
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('ReportMessage', reportMessageSchema);
