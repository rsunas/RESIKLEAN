const mongoose = require('mongoose');
const Route = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const RouteTrailSession = require('../models/RouteTrailSession');
const RouteTrailPoint = require('../models/RouteTrailPoint');
const DailyCycleLog = require('../models/DailyCycleLog');
const MissedReport = require('../models/MissedReport');
const ReportMessage = require('../models/ReportMessage');
const socketService = require('../services/socket.service');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');
const CapacityLog = require('../models/CapacityLog');
const { DENSITY_TONNES_PER_M3 } = require('../utils/capacityProjection');

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
      .select('name barangay schedule stops routePath')
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

    const isScheduledToday = route.schedule.includes(todayNum);

    // Use Manila midnight for "start of today" to avoid UTC offset issues
    const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(now);
    const startOfToday = new Date(manilaDateStr + 'T00:00:00+08:00');
    const completedSession = await RouteTrailSession.findOne({
      collectorId: req.user._id,
      routeId: route._id,
      status: 'completed',
      startedAt: { $gte: startOfToday }
    }).lean();

    const isCompletedToday = !!completedSession;
    const activeCycle = await DailyCycleLog.findOne({
      driverId: req.user._id,
      shiftStatus: 'active',
    })
      .sort({ shiftStart: -1 })
      .populate('truckId', 'plateNumber truckNumber color length width height')
      .lean();

    // Sort stops by order field
    route.stops.sort((a, b) => a.order - b.order);

    sendSuccess(res, {
      ...route,
      isScheduledToday,
      isCompletedToday,
      assignedTruck: activeCycle?.truckId || null,
    });
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

// ── POST /api/collector/route/complete ──────────────────────────────────────
// Marks the active route as completed for today.
const completeRoute = async (req, res) => {
  try {
    const { routeId, remarks } = req.body;
    if (!routeId) return sendError(res, 'Route ID is required', 400);

    // Use Manila midnight for "start of today" to avoid UTC offset issues
    const now = new Date();
    const manilaDateStr = new Intl.DateTimeFormat('en-CA', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      timeZone: 'Asia/Manila',
    }).format(now);
    const startOfToday = new Date(manilaDateStr + 'T00:00:00+08:00');

    let session = await RouteTrailSession.findOne({
      collectorId: req.user._id,
      routeId,
      startedAt: { $gte: startOfToday },
      status: { $in: ['active', 'completed'] },
    }).sort({ startedAt: -1 });

    if (!session) {
      const crypto = require('crypto');
      const route = await Route.findById(routeId).lean();
      if (!route) return sendError(res, 'Route not found', 404);

      session = new RouteTrailSession({
        clientSessionId: crypto.randomUUID(),
        collectorId: req.user._id,
        routeId,
        routeName: route.name || 'Manual Submission',
        startedAt: new Date(),
        status: 'active'
      });
    }

    session.status = 'completed';
    session.endedAt = new Date();
    if (remarks) session.remarks = remarks;
    await session.save();

    // Finishing a route also closes the driver's active shift assignment so
    // route-history reports have a real Shift End timestamp.
    await DailyCycleLog.updateMany(
      {
        driverId: req.user._id,
        shiftStatus: 'active',
        shiftStart: { $gte: startOfToday },
      },
      { $set: { shiftStatus: 'completed', shiftEnd: session.endedAt } },
    );

    sendSuccess(res, { message: 'Route successfully completed.' });
  } catch (err) {
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

// ── GET /api/collector/route-history ──────────────────────────────────────────
// DFD Process 4.0: Returns Route History to the Collector.
// Returns the logged-in Driver's own past RouteLog entries.
// Mirrors the pattern used by Staff's GET /api/staff/truckloads.
// Supports ?from=YYYY-MM-DD&to=YYYY-MM-DD date range filter.
// Supports ?grouped=true → returns cards per (routeId + eventDate) for mobile UI.
const haversineMi = (a, b) => {
  if (!a || !b) return 0;
  const R = 3958.8;
  const rad = (v) => v * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const lat1 = rad(a.latitude);
  const lat2 = rad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

const barangaySeed = (barangay) => {
  const name = String(Array.isArray(barangay) ? barangay.join(' ') : barangay || '').toLowerCase();
  let h = 0;
  for (let i = 0; i < name.length; i += 1) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
};

const getRouteHistory = async (req, res) => {
  try {
    const { from, to, grouped = false } = req.query;
    const filter = { collectorId: req.user._id };

    if (from || to) {
      filter.eventDate = {};
      if (from) filter.eventDate.$gte = from;
      if (to) filter.eventDate.$lte = to;
    }

    const logs = await RouteLog.find(filter)
      .populate('routeId', 'name barangay routePath stops')
      .sort({ collectedAt: -1 })
      .lean();

    const totalStops = logs.length;
    const flaggedCount = logs.filter((l) => l.flaggedForReview).length;
    const avgDwell = totalStops
      ? +(logs.reduce((sum, l) => sum + (l.dwellSeconds || 0), 0) / totalStops).toFixed(1)
      : 0;

    if (!grouped) {
      return sendSuccess(res, {
        count: totalStops,
        flaggedCount,
        avgDwellSeconds: avgDwell,
        logs,
      });
    }

    const groupsMap = new Map();
    logs.forEach((log) => {
      const route = log.routeId || {};
      const routeId = String(route._id || log.routeId);
      const key = `${log.eventDate}|${routeId}`;
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          id: key,
          date: log.eventDate,
          routeId,
          routeName: route.name || 'Unnamed route',
          barangay: route.barangay || [],
          routePath: route.routePath || null,
          totalStops: route.stops?.length || 0,
          collected: 0,
          flagged: 0,
          dwellSecondsTotal: 0,
          stopLogs: [],
          firstEntry: null,
          lastExit: null,
          sessionId: null,
          sessionStartedAt: null,
          sessionEndedAt: null,
        });
      }
      const group = groupsMap.get(key);
      group.stopLogs.push(log);
      if (log.status === 'collected') group.collected += 1;
      if (log.flaggedForReview) group.flagged += 1;
      group.dwellSecondsTotal += log.dwellSeconds || 0;
      const entryTs = log.collectedAt ? new Date(log.collectedAt).getTime() : 0;
      const exitTs = log.exitedAt ? new Date(log.exitedAt).getTime() : 0;
      if (entryTs && (!group.firstEntry || entryTs < group.firstEntry)) group.firstEntry = entryTs;
      if (exitTs && (!group.lastExit || exitTs > group.lastExit)) group.lastExit = exitTs;
    });

    // Completed trail sessions are history records even when the driver did
    // not log an individual stop. This keeps route completion visible in the
    // driver's history and in the admin dashboard using real session data.
    const sessionCandidates = await RouteTrailSession.find({
      collectorId: req.user._id,
      status: 'completed',
    })
      .sort({ startedAt: -1 })
      .limit(50)
      .lean();
    const sessionRouteIds = sessionCandidates
      .map((session) => session.routeId)
      .filter((routeId) => mongoose.Types.ObjectId.isValid(routeId));
    const sessionRoutes = sessionRouteIds.length
      ? await Route.find({ _id: { $in: sessionRouteIds } }).select('name barangay routePath stops').lean()
      : [];
    const sessionRouteById = new Map(sessionRoutes.map((route) => [String(route._id), route]));
    sessionCandidates.forEach((session) => {
      const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(session.startedAt));
      const routeId = String(session.routeId);
      const key = `${dateKey}|${routeId}`;
      const route = sessionRouteById.get(routeId) || {};
      if (!groupsMap.has(key)) {
        groupsMap.set(key, {
          id: key,
          date: dateKey,
          routeId,
          routeName: route.name || session.routeName || 'Unnamed route',
          barangay: route.barangay || [],
          routePath: route.routePath || null,
          totalStops: route.stops?.length || 0,
          collected: 0,
          flagged: 0,
          dwellSecondsTotal: 0,
          stopLogs: [],
          firstEntry: null,
          lastExit: null,
          sessionId: null,
          sessionStartedAt: null,
          sessionEndedAt: null,
        });
      }
      const group = groupsMap.get(key);
      if (!group.sessionId) group.sessionId = session.clientSessionId;
      if (!group.sessionStartedAt || new Date(session.startedAt) < new Date(group.sessionStartedAt)) group.sessionStartedAt = session.startedAt;
      if (!group.sessionEndedAt || (session.endedAt && new Date(session.endedAt) > new Date(group.sessionEndedAt))) group.sessionEndedAt = session.endedAt;
    });

    const groups = await Promise.all([...groupsMap.values()].map(async (group) => {
      const sessionId = group.sessionId;
      const avgDwellSeconds = group.stopLogs.length ? +(group.dwellSecondsTotal / group.stopLogs.length).toFixed(1) : 0;

      let distanceMi = 0;
      let elevationGainFt = 0;
      let elevationLossFt = 0;
      let trailPoints = [];
      if (sessionId) {
        trailPoints = await RouteTrailPoint.find({ clientSessionId: sessionId, collectorId: req.user._id })
          .sort({ recordedAt: 1 })
          .select('latitude longitude altitudeMeters recordedAt')
          .limit(2000)
          .lean();
        for (let i = 1; i < trailPoints.length; i += 1) {
          distanceMi += haversineMi(trailPoints[i - 1], trailPoints[i]);
          const prevAltFt = (trailPoints[i - 1].altitudeMeters || 0) * 3.28084;
          const currAltFt = (trailPoints[i].altitudeMeters || 0) * 3.28084;
          const diff = currAltFt - prevAltFt;
          if (diff > 0) elevationGainFt += diff;
          else elevationLossFt += -diff;
        }
      }
      const trailPath = trailPoints.length >= 2
        ? { type: 'LineString', coordinates: trailPoints.map((point) => [point.longitude, point.latitude]) }
        : null;

      return {
        id: group.id,
        date: group.date,
        routeId: group.routeId,
        routeName: group.routeName,
        barangay: Array.isArray(group.barangay) ? group.barangay.filter(Boolean) : [group.barangay].filter(Boolean),
        totalStops: group.totalStops,
        collected: group.collected,
        flagged: group.flagged,
        avgDwellSeconds,
        distanceMi: +distanceMi.toFixed(1),
        greeneryPct: null,
        elevationGainFt: Math.round(elevationGainFt),
        elevationLossFt: Math.round(elevationLossFt),
        firstEntry: group.firstEntry ? new Date(group.firstEntry).toISOString() : null,
        lastExit: group.lastExit ? new Date(group.lastExit).toISOString() : null,
        sessionStartedAt: group.sessionStartedAt ? new Date(group.sessionStartedAt).toISOString() : null,
        sessionEndedAt: group.sessionEndedAt ? new Date(group.sessionEndedAt).toISOString() : null,
        sessionId: sessionId || null,
        routePath: group.routePath,
        trailPath,
        stopLogs: group.stopLogs.sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt)),
      };
    }));

    groups.sort((a, b) => (a.date < b.date ? 1 : -1));
    return sendSuccess(res, {
      count: totalStops,
      flaggedCount,
      avgDwellSeconds: avgDwell,
      groups,
      logs,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/collector/complaints/:reportId/resolve ────────────────────────
// Drivers resolve a missed report in their area with a proof photo.
const resolveComplaint = async (req, res) => {
  try {
    const { reportId } = req.params;
    const { clientId, resolutionNote, photoMetadata } = req.body;

    const report = await MissedReport.findById(reportId);
    if (!report) return sendError(res, 'Report not found', 404);

    // Offline idempotency: If already resolved by this exact client request
    if (clientId && report.status === 'resolved' && report.resolutionClientId === clientId) {
      return sendSuccess(res, report, 200);
    }

    if (report.status !== 'verified') {
      return sendError(res, 'Only administrator-approved complaints can be resolved', 400);
    }

    // Must belong to driver's active route (by barangay area)
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    });
    if (!route) return sendError(res, 'No active route assigned to you', 404);
    if (!route.barangay.includes(report.barangay)) {
      return sendError(res, 'Complaint does not belong to your assigned area', 403);
    }

    if (!req.file) {
      return sendError(res, 'A proof photo is required to resolve a complaint', 400);
    }

    // Parse photo metadata
    let parsedMetadata = {};
    if (photoMetadata) {
      try {
        parsedMetadata = JSON.parse(photoMetadata);
      } catch (e) {
        // Ignore parse error
      }
    }

    // Validate lat/lng
    const { latitude, longitude } = parsedMetadata;
    if (latitude && isNaN(Number(latitude))) return sendError(res, 'latitude must be a number', 400);
    if (longitude && isNaN(Number(longitude))) return sendError(res, 'longitude must be a number', 400);

    // Upload to Cloudinary
    const result = await uploadPhoto(req.file.buffer, 'resiklean/resolutions');

    // Update Report
    report.status = 'resolved';
    report.resolutionPhotoUrl = result.url;
    report.resolutionNote = resolutionNote || '';
    report.resolvedBy = req.user._id;
    report.resolvedAt = new Date();
    report.resolutionClientId = clientId || undefined;
    report.resolutionPhotoMetadata = parsedMetadata;

    await report.save();

    // Create the automated chat message with the proof photo
    const message = await ReportMessage.create({
      reportId: report._id,
      senderId: req.user._id,
      senderRole: 'collector',
      body: 'Your complaint has been resolved by the driver.',
      photoUrl: result.url,
      photoMetadata: parsedMetadata,
    });

    // Socket: Update admins and resident
    if (socketService.emitToComplaint) {
      socketService.emitToComplaint('complaint:status-updated', report.residentId._id || report.residentId, {
        reportId: report._id,
        status: report.status,
        report,
      });
      socketService.emitToComplaint('complaint:message-created', report.residentId._id || report.residentId, {
        reportId: report._id,
        message,
      });
    }

    sendSuccess(res, { report, message }, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/collector/complaints ───────────────────────────────────────────
// Returns unresolved complaints in the collector's assigned barangay
// that have valid GPS coordinates (for map markers).
const getComplaints = async (req, res) => {
  try {
    const route = await Route.findOne({
      collectorId: req.user._id,
      isActive: true,
    }).lean();

    if (!route) return sendError(res, 'No active route assigned to you', 404);

    const complaints = await MissedReport.find({
      barangay: { $in: route.barangay },
      status: 'verified',
      'photoMetadata.latitude': { $exists: true, $type: 'number' },
      'photoMetadata.longitude': { $exists: true, $type: 'number' },
    })
      .populate('residentId', 'name')
      .select('barangay description photoUrl status createdAt photoMetadata residentId')
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, complaints);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

const parseTrailDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const validTrailCoordinate = (latitude, longitude) => (
  Number.isFinite(latitude)
  && Number.isFinite(longitude)
  && latitude >= -90
  && latitude <= 90
  && longitude >= -180
  && longitude <= 180
);

const batchSyncTrails = async (req, res) => {
  const sessions = Array.isArray(req.body?.sessions) ? req.body.sessions : [];
  if (!sessions.length) return sendError(res, 'sessions must be a non-empty array', 400);

  const syncedSessionIds = [];
  const syncedPointIds = [];
  const skippedPoints = [];
  const rejectedSessions = [];

  for (const payload of sessions) {
    const clientSessionId = String(payload?.clientSessionId || '').trim();
    const routeId = String(payload?.routeId || '').trim();
    const startedAt = parseTrailDate(payload?.startedAt);
    if (!clientSessionId || !mongoose.Types.ObjectId.isValid(routeId) || !startedAt) continue;

    const route = await Route.findOne({ _id: routeId, collectorId: req.user._id, isActive: true }).select('name');
    if (!route) continue;

    const endedAt = parseTrailDate(payload?.endedAt);
    const isCompleted = payload?.status === 'completed';
    const sessionIdentity = {
      clientSessionId,
      collectorId: req.user._id,
      routeId: route._id,
    };
    let session = await RouteTrailSession.findOne({ clientSessionId });

    // A client session is immutable: a delayed or duplicated request must never
    // reassign it to another collector or route.
    if (session && (!session.collectorId.equals(req.user._id) || !session.routeId.equals(route._id))) {
      rejectedSessions.push({ clientSessionId, reason: 'session identity conflict' });
      continue;
    }

    if (!session) {
      try {
        session = await RouteTrailSession.create({
          ...sessionIdentity,
          routeName: route.name,
          startedAt,
          ...(endedAt ? { endedAt } : {}),
          status: isCompleted ? 'completed' : 'active',
          lastSyncedAt: new Date(),
        });
      } catch (error) {
        // Another device may have inserted the same session between the read
        // and create. Re-read it and apply the same immutable-identity check.
        if (error?.code !== 11000) throw error;
        session = await RouteTrailSession.findOne({ clientSessionId });
        if (!session || !session.collectorId.equals(req.user._id) || !session.routeId.equals(route._id)) {
          rejectedSessions.push({ clientSessionId, reason: 'session identity conflict' });
          continue;
        }
      }
    }

    // Completion is monotonic. An older "active" replay may update sync
    // metadata, but can never revert a completed session.
    const sessionUpdate = { $set: { lastSyncedAt: new Date() } };
    if (isCompleted) sessionUpdate.$set.status = 'completed';
    if (endedAt) sessionUpdate.$max = { endedAt };
    await RouteTrailSession.updateOne(sessionIdentity, sessionUpdate);

    const points = Array.isArray(payload?.points) ? payload.points : [];
    const seenTimes = new Set();
    const validPoints = [];
    const rejectedPointIds = [];
    for (const point of points) {
      const clientId = String(point?.clientId || '').trim();
      const recordedAt = parseTrailDate(point?.recordedAt);
      const latitude = Number(point?.latitude);
      const longitude = Number(point?.longitude);
      const timeKey = recordedAt?.toISOString();
      if (!clientId || !recordedAt || !timeKey || !validTrailCoordinate(latitude, longitude) || seenTimes.has(timeKey)) {
        if (clientId) {
          skippedPoints.push(clientId);
          rejectedPointIds.push(clientId);
        }
        continue;
      }
      seenTimes.add(timeKey);
      validPoints.push({
        clientId,
        clientSessionId,
        collectorId: req.user._id,
        routeId,
        routeName: route.name,
        recordedAt,
        latitude,
        longitude,
        accuracyMeters: Number.isFinite(Number(point?.accuracyMeters)) ? Number(point.accuracyMeters) : undefined,
        altitudeMeters: Number.isFinite(Number(point?.altitudeMeters)) ? Number(point.altitudeMeters) : undefined,
        headingDegrees: Number.isFinite(Number(point?.headingDegrees)) ? Number(point.headingDegrees) : undefined,
        speedMetersPerSecond: Number.isFinite(Number(point?.speedMetersPerSecond)) ? Number(point.speedMetersPerSecond) : undefined,
      });
    }

    if (validPoints.length) {
      const existingPoints = await RouteTrailPoint.find({
        clientId: { $in: validPoints.map((point) => point.clientId) },
      }).select('clientId clientSessionId collectorId routeId').lean();
      const existingByClientId = new Map(existingPoints.map((point) => [point.clientId, point]));
      const candidates = validPoints.filter((point) => {
        const existing = existingByClientId.get(point.clientId);
        const belongsToSession = !existing
          || (existing.clientSessionId === clientSessionId
            && String(existing.collectorId) === String(req.user._id)
            && String(existing.routeId) === routeId);
        if (!belongsToSession) {
          skippedPoints.push(point.clientId);
          rejectedPointIds.push(point.clientId);
        }
        return belongsToSession;
      });

      if (candidates.length) {
        try {
          await RouteTrailPoint.bulkWrite(
            candidates.map((point) => ({
              updateOne: {
                filter: { clientId: point.clientId },
                update: { $setOnInsert: point },
                upsert: true,
              },
            })),
            { ordered: false },
          );
        } catch (error) {
          if (error?.code !== 11000 && !error?.writeErrors?.every((writeError) => writeError.code === 11000)) throw error;
        }
      }
      // Do not acknowledge a point merely because bulkWrite completed. A
      // concurrent insert can lose a unique-index race (for example the
      // session/timestamp index); only durably stored matching points count.
      const confirmedPoints = candidates.length
        ? await RouteTrailPoint.find({ clientId: { $in: candidates.map((point) => point.clientId) } })
          .select('clientId clientSessionId collectorId routeId')
          .lean()
        : [];
      const confirmedIds = new Set(confirmedPoints
        .filter((point) => point.clientSessionId === clientSessionId
          && String(point.collectorId) === String(req.user._id)
          && String(point.routeId) === routeId)
        .map((point) => point.clientId));
      syncedPointIds.push(...confirmedIds);
      rejectedPointIds.push(...candidates
        .map((point) => point.clientId)
        .filter((clientId) => !confirmedIds.has(clientId)));
      skippedPoints.push(...rejectedPointIds.filter((clientId) => !skippedPoints.includes(clientId)));
      if (rejectedPointIds.length) {
        rejectedSessions.push({ clientSessionId, reason: 'one or more trail points were not stored' });
        continue;
      }
    } else if (rejectedPointIds.length) {
      rejectedSessions.push({ clientSessionId, reason: 'one or more trail points were invalid' });
      continue;
    }

    const pointCount = await RouteTrailPoint.countDocuments({ clientSessionId });
    await RouteTrailSession.updateOne(
      { clientSessionId },
      { $set: { pointCount, lastSyncedAt: new Date() } },
    );
    syncedSessionIds.push(clientSessionId);
  }

  return sendSuccess(res, { syncedSessionIds, syncedPointIds, skippedPoints, rejectedSessions });
};

const getTrailHistory = async (req, res) => {
  const sessionFilter = { collectorId: req.user._id };
  if (req.query.sessionId) sessionFilter.clientSessionId = req.query.sessionId;
  if (req.query.routeId && mongoose.Types.ObjectId.isValid(req.query.routeId)) sessionFilter.routeId = req.query.routeId;

  const from = parseTrailDate(req.query.from);
  const to = parseTrailDate(req.query.to);
  if (from || to) sessionFilter.startedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

  const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
  const sessions = await RouteTrailSession.find(sessionFilter).sort({ startedAt: -1 }).limit(limit).lean();
  const sessionIds = sessions.map((session) => session.clientSessionId);
  const points = sessionIds.length
    ? await RouteTrailPoint.find({ collectorId: req.user._id, clientSessionId: { $in: sessionIds } }).sort({ recordedAt: 1 }).lean()
    : [];

  return sendSuccess(res, { sessions, points, count: sessions.length });
};

const batchSyncCapacity = async (req, res) => {
  try {
    const { logs } = req.body;
    if (!Array.isArray(logs) || logs.length === 0) {
      return sendError(res, 'Request body must contain a non-empty "logs" array', 400);
    }

    // Must have active cycle
    const cycle = await DailyCycleLog.findOne({
      driverId: req.user._id,
      shiftStatus: 'active',
    }).sort({ shiftStart: -1 }).populate('truckId').lean();

    if (!cycle || !cycle.truckId) {
      return sendError(res, 'You do not have an active shift/cycle', 403);
    }

    // Must have active route
    const route = await Route.findOne({ collectorId: req.user._id, isActive: true }).lean();
    if (!route) {
      return sendError(res, 'No active route assigned to you', 403);
    }

    const totalStops = route.stops ? route.stops.length : 0;

    const clientIds = logs.map(l => l.clientId).filter(Boolean);
    const existingLogs = clientIds.length
      ? await CapacityLog.find({ clientId: { $in: clientIds } }).select('clientId').lean()
      : [];
    const existingSet = new Set(existingLogs.map(l => l.clientId));

    const syncedIds = [];
    const failed = [];
    const capacity = Number(cycle.truckId.length || 0)
      * Number(cycle.truckId.width || 0)
      * Number(cycle.truckId.height || 0);

    for (const record of logs) {
      const { clientId, type, fillLevelPct, loggedAt } = record || {};

      if (!clientId) {
        failed.push({ clientId: null, reason: 'missing clientId' });
        continue;
      }
      if (existingSet.has(clientId)) {
        syncedIds.push(clientId);
        continue;
      }
      
      let level = Number(fillLevelPct);
      if (type === 'reset') {
        level = 0;
      } else if (!Number.isInteger(level) || level < 10 || level > 100 || level % 10 !== 0) {
        failed.push({ clientId, reason: 'fillLevelPct must be 10-100 in steps of 10' });
        continue;
      }

      const recordedAt = loggedAt ? new Date(loggedAt) : new Date();
      if (Number.isNaN(recordedAt.getTime())) {
        failed.push({ clientId, reason: 'loggedAt must be a valid date' });
        continue;
      }

      const stopsCompleted = await RouteLog.countDocuments({
        routeId: route._id,
        collectorId: req.user._id,
        status: 'collected',
        collectedAt: { $gte: cycle.shiftStart, $lte: recordedAt },
      });
      const estimatedVolumeM3 = Number((capacity * (level / 100)).toFixed(3));
      const estimatedTonnage = Number((estimatedVolumeM3 * DENSITY_TONNES_PER_M3).toFixed(3));

      try {
        await CapacityLog.create({
          clientId,
          type: type || 'log',
          driverId: req.user._id,
          truckId: cycle.truckId._id,
          cycleLogId: cycle._id,
          routeId: route._id,
          fillLevelPct: level,
          stopsCompleted,
          totalStops,
          estimatedVolumeM3,
          estimatedTonnage,
          loggedAt: recordedAt,
          dataSource: 'real',
        });
        syncedIds.push(clientId);
        existingSet.add(clientId);
      } catch (err) {
        if (err.code === 11000) {
          syncedIds.push(clientId);
        } else {
          failed.push({ clientId, reason: err.message });
        }
      }
    }

    sendSuccess(res, {
      syncedIds: [...new Set(syncedIds)],
      failed,
      total: logs.length,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/collector/capacity/latest ───────────────────────────────────────
// The collector UI uses this read-only value for the reported truck-load gauge.
const getLatestCapacity = async (req, res) => {
  try {
    const cycle = await DailyCycleLog.findOne({
      driverId: req.user._id,
      shiftStatus: 'active',
    }).sort({ shiftStart: -1 }).lean();

    if (!cycle) return sendSuccess(res, null);

    const latestLog = await CapacityLog.findOne({ cycleLogId: cycle._id, type: 'reset' })
      .sort({ loggedAt: -1 })
      .lean();
    return sendSuccess(res, latestLog || null);
  } catch (err) {
    return sendError(res, err.message, 500);
  }
};

module.exports = {
  getAssignedRoute,
  markStop,
  batchSyncLogs,
  getTodayProgress,
  getRouteHistory,
  resolveComplaint,
  getComplaints,
  batchSyncTrails,
  getTrailHistory,
  completeRoute,
  batchSyncCapacity,
  getLatestCapacity,
};
