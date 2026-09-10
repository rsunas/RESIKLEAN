const Route    = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/collector/route ──────────────────────────────────────────────────
// Returns the route assigned to the logged-in collector,
// but ONLY if the route is scheduled for today.
// Stops are returned ordered by sequence.
const getAssignedRoute = async (req, res) => {
  try {
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    })
      .select('name barangay schedule stops')
      .lean();

    if (!route) return sendError(res, 'No active route assigned to you', 404);

    // Check if today is a scheduled collection day for this route
    // Route.schedule stores day-of-week numbers: 0=Sun, 1=Mon, …, 6=Sat
    const now = new Date();
    // Convert to Manila timezone to get the correct local day
    const manilaDay = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Manila',
    }).format(now);

    const dayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const todayNum = dayMap[manilaDay];

    if (!route.schedule.includes(todayNum)) {
      return sendError(res, 'Your route is not scheduled for today', 404);
    }

    // Sort stops by order field
    route.stops.sort((a, b) => a.order - b.order);

    sendSuccess(res, route);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/collector/route/logs/:stopId ───────────────────────────────────
// Records a complete stop collection on geofence EXIT.
// Body: { latitude, longitude, collectedAt, exitedAt }
// collectedAt = geofence entry time, exitedAt = geofence exit time.
// dwellSeconds is computed server-side (not trusted from device).
// flaggedForReview is auto-set if dwellSeconds < 30 (SWMO threshold).
const markStop = async (req, res) => {
  try {
    const { stopId } = req.params;
    const { latitude, longitude, collectedAt, exitedAt } = req.body;

    if (!exitedAt) return sendError(res, 'exitedAt is required (geofence exit timestamp)', 400);

    // Look up the collector's active route
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    });
    if (!route) return sendError(res, 'No active route assigned to you', 404);

    // Confirm the stop belongs to this route
    const stopExists = route.stops.some((s) => s._id.toString() === stopId);
    if (!stopExists) return sendError(res, 'Stop does not belong to your route', 404);

    // Prevent duplicate logs for the same stop on the same calendar day
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const existing = await RouteLog.findOne({
      routeId: route._id,
      collectorId: req.user._id,
      stopId,
      createdAt: { $gte: startOfDay, $lte: endOfDay },
    });
    if (existing) return sendError(res, 'Stop already logged today', 409);

    // Compute dwell time server-side (seconds between entry and exit)
    const entryTime = collectedAt ? new Date(collectedAt) : new Date();
    const exitTime = new Date(exitedAt);
    const dwellSeconds = Math.max(0, Math.round((exitTime - entryTime) / 1000));

    // Flag for review if dwell time is below SWMO threshold (30 seconds)
    const flaggedForReview = dwellSeconds < RouteLog.DWELL_THRESHOLD_SECONDS;

    const log = await RouteLog.create({
      routeId: route._id,
      collectorId: req.user._id,
      stopId,
      collectedAt: entryTime,
      exitedAt: exitTime,
      dwellSeconds,
      latitude,
      longitude,
      status: 'collected', // Always auto-set; client cannot override
      flaggedForReview,
    });

    sendSuccess(res, log, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/collector/route/progress ─────────────────────────────────────────
// Returns today's collection progress: how many stops done vs total.
const getTodayProgress = async (req, res) => {
  try {
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    }).lean();

    if (!route) return sendError(res, 'No active route assigned to you', 404);

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const logs = await RouteLog.find({
      routeId: route._id,
      collectorId: req.user._id,
      createdAt: { $gte: startOfDay },
    }).lean();

    const totalStops   = route.stops.length;
    const completedIds = new Set(logs.map((l) => l.stopId.toString()));
    const completed    = logs.filter((l) => l.status === 'collected').length;

    sendSuccess(res, {
      routeName: route.name,
      totalStops,
      completed,
      remaining: totalStops - completedIds.size,
      complianceRate: totalStops
        ? `${((completed / totalStops) * 100).toFixed(1)}%`
        : '0%',
      logs,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { getAssignedRoute, markStop, getTodayProgress };
