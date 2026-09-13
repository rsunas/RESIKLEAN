const Route = require('../models/Route');
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
// Records a complete stop collection on geofence EXIT (single record).
// Body: { clientId, latitude, longitude, collectedAt, exitedAt }
// clientId = UUID from device for offline dedup.
// collectedAt = geofence entry time, exitedAt = geofence exit time.
// dwellSeconds is computed server-side (not trusted from device).
// flaggedForReview is auto-set if dwellSeconds < 30 (SWMO threshold).
const markStop = async (req, res) => {
  try {
    const { stopId } = req.params;
    const { clientId, latitude, longitude, collectedAt, exitedAt } = req.body;

    if (!exitedAt) return sendError(res, 'exitedAt is required (geofence exit timestamp)', 400);

    // UUID dedup — if this clientId was already synced, return the existing log
    if (clientId) {
      const dup = await RouteLog.findOne({ clientId }).lean();
      if (dup) return sendSuccess(res, dup, 200); // idempotent, not an error
    }

    // Look up the collector's active route
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    });
    if (!route) return sendError(res, 'No active route assigned to you', 404);

    // Confirm the stop belongs to this route
    const stopExists = route.stops.some((s) => s._id.toString() === stopId);
    if (!stopExists) return sendError(res, 'Stop does not belong to your route', 404);

    // Compute dwell time server-side (seconds between entry and exit)
    const entryTime = collectedAt ? new Date(collectedAt) : new Date();
    const exitTime = new Date(exitedAt);
    const dwellSeconds = Math.max(0, Math.round((exitTime - entryTime) / 1000));

    // Flag for review if dwell time is below SWMO threshold (30 seconds)
    const flaggedForReview = dwellSeconds < RouteLog.DWELL_THRESHOLD_SECONDS;

    // Derive eventDate from collectedAt in Manila timezone (YYYY-MM-DD).
    // The compound unique index (stopId + collectorId + eventDate) enforces
    // one-log-per-stop-per-day at the database level — no race condition possible.
    const eventDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(entryTime); // en-CA gives YYYY-MM-DD format

    const log = await RouteLog.create({
      clientId: clientId || undefined,
      routeId: route._id,
      collectorId: req.user._id,
      stopId,
      eventDate,
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
    // Compound unique index violation — stop already logged today
    if (err.code === 11000 && err.message.includes('eventDate')) {
      return sendError(res, 'Stop already logged today', 409);
    }
    sendError(res, err.message, 500);
  }
};

// ── POST /api/collector/route/logs/batch ──────────────────────────────────────
// Offline-first batch sync: accepts an array of queued log records.
// Each record must include a clientId (UUID) for idempotency.
// Duplicates (by clientId) are silently skipped — interrupted syncs
// can retry safely without double-inserting (Section 3.2 pattern).
// Body: { logs: [{ clientId, stopId, collectedAt, exitedAt, latitude, longitude }] }
const batchSyncLogs = async (req, res) => {
  try {
    const { logs } = req.body;

    if (!Array.isArray(logs) || logs.length === 0) {
      return sendError(res, 'Request body must contain a non-empty "logs" array', 400);
    }

    // Look up the collector's active route (single query for all records)
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    });
    if (!route) return sendError(res, 'No active route assigned to you', 404);

    const stopIds = new Set(route.stops.map((s) => s._id.toString()));

    // Collect all clientIds from the batch to check for existing duplicates
    const clientIds = logs
      .map((l) => l.clientId)
      .filter(Boolean);

    const existingLogs = clientIds.length
      ? await RouteLog.find({ clientId: { $in: clientIds } }).select('clientId').lean()
      : [];
    const existingSet = new Set(existingLogs.map((l) => l.clientId));

    const inserted = [];
    const skipped = [];

    for (const record of logs) {
      const { clientId, stopId, collectedAt, exitedAt, latitude, longitude } = record;

      // Must have a clientId for batch dedup
      if (!clientId) {
        skipped.push({ clientId: null, reason: 'missing clientId' });
        continue;
      }

      // Skip if already synced
      if (existingSet.has(clientId)) {
        skipped.push({ clientId, reason: 'duplicate' });
        continue;
      }

      // Validate stop belongs to this route
      if (!stopIds.has(stopId)) {
        skipped.push({ clientId, reason: 'stop not in route' });
        continue;
      }

      // Validate exitedAt is present
      if (!exitedAt) {
        skipped.push({ clientId, reason: 'missing exitedAt' });
        continue;
      }

      // Compute dwell time server-side
      const entryTime = collectedAt ? new Date(collectedAt) : new Date();
      const exitTime = new Date(exitedAt);
      const dwellSeconds = Math.max(0, Math.round((exitTime - entryTime) / 1000));
      const flaggedForReview = dwellSeconds < RouteLog.DWELL_THRESHOLD_SECONDS;

      // Derive eventDate from collectedAt in Manila timezone (YYYY-MM-DD)
      const eventDate = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Manila',
      }).format(entryTime);

      try {
        const log = await RouteLog.create({
          clientId,
          routeId: route._id,
          collectorId: req.user._id,
          stopId,
          eventDate,
          collectedAt: entryTime,
          exitedAt: exitTime,
          dwellSeconds,
          latitude,
          longitude,
          status: 'collected',
          flaggedForReview,
        });
        inserted.push(log);
        existingSet.add(clientId); // prevent intra-batch duplicates
      } catch (err) {
        // Unique index collision (race condition) — treat as duplicate
        if (err.code === 11000) {
          skipped.push({ clientId, reason: 'duplicate' });
        } else {
          skipped.push({ clientId, reason: err.message });
        }
      }
    }

    // Section 3.2 - Confirmation and Local Cleanup:
    // Return syncedIds so the device can mark these records as synced
    // in its local SQLite database and clear them from the sync queue.
    const syncedIds = inserted.map((l) => l.clientId);

    sendSuccess(res, {
      inserted: inserted.length,
      skipped: skipped.length,
      total: logs.length,
      syncedIds,
      details: { inserted, skipped },
    }, 201);
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

    // Use eventDate (Manila TZ) for consistent day filtering
    const todayDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(new Date()); // YYYY-MM-DD

    const logs = await RouteLog.find({
      routeId: route._id,
      collectorId: req.user._id,
      eventDate: todayDate,
    }).lean();

    const totalStops = route.stops.length;
    const completedIds = new Set(logs.map((l) => l.stopId.toString()));
    const completed = logs.filter((l) => l.status === 'collected').length;

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

module.exports = { getAssignedRoute, markStop, batchSyncLogs, getTodayProgress };

