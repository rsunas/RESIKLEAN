const ReportMessage = require('../models/ReportMessage');
const MissedReport  = require('../models/MissedReport');
const socketService = require('../services/socket.service');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET  /api/resident/reports/:reportId/messages ────────────────────────────
// ── GET  /api/admin/reports/:reportId/messages ───────────────────────────────
// Fetch all messages for a given report (oldest first).
const getMessages = async (req, res) => {
  try {
    const { reportId } = req.params;

    // Verify report exists
    const report = await MissedReport.findById(reportId).lean();
    if (!report) return sendError(res, 'Report not found', 404);

    // Residents may only view their own reports
    if (req.user.role === 'resident' && report.residentId.toString() !== req.user._id.toString()) {
      return sendError(res, 'You can only view messages on your own reports', 403);
    }

    const messages = await ReportMessage.find({ reportId })
      .populate('senderId', 'name profilePhotoUrl')
      .sort({ createdAt: 1 })
      .lean();

    sendSuccess(res, messages);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/resident/reports/:reportId/messages ────────────────────────────
// ── POST /api/admin/reports/:reportId/messages ───────────────────────────────
// Send a new message on a report thread.
const sendMessage = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { body } = req.body;

    // ── Validation ─────────────────────────────────────────────────────────
    if (!body || !body.trim()) {
      return sendError(res, 'Message body cannot be empty', 400);
    }

    if (body.length > 1000) {
      return sendError(res, 'Message must be 1000 characters or fewer', 400);
    }

    // Verify report exists
    const report = await MissedReport.findById(reportId).lean();
    if (!report) return sendError(res, 'Report not found', 404);

    // Residents may only message their own reports
    if (req.user.role === 'resident' && report.residentId.toString() !== req.user._id.toString()) {
      return sendError(res, 'You can only send messages on your own reports', 403);
    }

    // ── Create message ─────────────────────────────────────────────────────
    const message = await ReportMessage.create({
      reportId,
      senderId: req.user._id,
      senderRole: req.user.role,
      body: body.trim(),
    });

    // Populate sender info before emitting / responding
    const populated = await ReportMessage.findById(message._id)
      .populate('senderId', 'name profilePhotoUrl')
      .lean();

    // ── Real-time Socket.IO event ──────────────────────────────────────────
    socketService.emit('complaint:message-created', {
      reportId,
      message: populated,
    });

    sendSuccess(res, populated, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { getMessages, sendMessage };
