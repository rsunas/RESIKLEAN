const Route    = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/collector/route ──────────────────────────────────────────────────
// Returns the route assigned to the logged-in collector,
// including all stops ordered by sequence.
const getAssignedRoute = async (req, res) => {
  try {
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    })
      .select('name barangay schedule stops')
      .lean();

    if (!route) return sendError(res, 'No active route assigned to you', 404);

    // Sort stops by order field
    route.stops.sort((a, b) => a.order - b.order);

    sendSuccess(res, route);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/collector/route/logs/:stopId ───────────────────────────────────
// Collector marks a stop as collected (or skipped).
// Body: { latitude, longitude, collectedAt, status }
// This is called when the mobile app detects a geofence entry,
// even if it was recorded offline and synced later.
const markStop = async (req, res) => {
  try {
    const { stopId } = req.params;
    const { latitude, longitude, collectedAt, status = 'collected' } = req.body;

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

    const log = await RouteLog.create({
      routeId: route._id,
      collectorId: req.user._id,
      stopId,
      collectedAt: collectedAt ? new Date(collectedAt) : new Date(),
      latitude,
      longitude,
      status,
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
    const skipped      = logs.filter((l) => l.status === 'skipped').length;

    sendSuccess(res, {
      routeName: route.name,
      totalStops,
      completed,
      skipped,
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
