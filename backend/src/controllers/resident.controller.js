const MissedReport = require('../models/MissedReport');
const Route        = require('../models/Route');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/resident/schedule ────────────────────────────────────────────────
// Returns the active collection routes for the resident's barangay,
// filtered to only routes that run today (by day-of-week).
const getSchedule = async (req, res) => {
  try {
    const { barangay } = req.user;
    if (!barangay) return sendError(res, 'Your profile has no barangay set', 400);

    const today = new Date().getDay(); // 0=Sun … 6=Sat

    const routes = await Route.find({
      barangay,
      isActive: true,
      schedule: today,
    })
      .select('name barangay schedule stops')
      .lean();

    sendSuccess(res, { barangay, today, routes });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/resident/reports ────────────────────────────────────────────────
// Resident submits a missed collection report.
// Photo upload (Cloudinary) and AI verification (Roboflow) are handled
// by their respective services — wired in the media & CV sprints.
const submitReport = async (req, res) => {
  try {
    const { description, photoUrl } = req.body;
    const { _id: residentId, barangay } = req.user;

    if (!barangay) return sendError(res, 'Your profile has no barangay set', 400);

    const report = await MissedReport.create({
      residentId,
      barangay,
      description: description || '',
      photoUrl: photoUrl || null,
      // aiVerified & aiConfidence will be updated by the Roboflow sprint
    });

    sendSuccess(res, report, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/resident/reports ─────────────────────────────────────────────────
// Returns the logged-in resident's own reports, newest first.
// Supports optional ?status= filter (pending | verified | rejected | resolved).
const getMyReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { residentId: req.user._id };
    if (status) filter.status = status;

    const reports = await MissedReport.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, reports);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { getSchedule, submitReport, getMyReports };
