const mongoose = require('mongoose');
const PDFDocument = require('pdfkit');
const User = require('../models/User');
const Route = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const RouteTrailSession = require('../models/RouteTrailSession');
const RouteTrailPoint = require('../models/RouteTrailPoint');
const MissedReport = require('../models/MissedReport');
const TruckLoad = require('../models/TruckLoad');
const Truck = require('../models/Truck');
const DailyCycleLog = require('../models/DailyCycleLog');
const CapacityLog = require('../models/CapacityLog');
const socketService = require('../services/socket.service');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');
const { buildRouteHistoryPayload, generateRouteHistoryPDF } = require('../services/pdf/routeHistoryReport');
const { calculateProjection, STATUS_OK, STATUS_WARNING, STATUS_CRITICAL } = require('../utils/capacityProjection');

// ── GET /api/admin/users ──────────────────────────────────────────────────────
// Returns all users. Supports ?role= filter.
const getAllUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const filter = role ? { role } : {};

    const users = await User.find(filter)
      .select('-password')
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, { count: users.length, users });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/admin/users ─────────────────────────────────────────────────────
// Creates a new collector or staff user.
// Body: { name, email, password, role, employeeId?, contact?, shift? }
const createUser = async (req, res) => {
  try {
    const { name, email, password, role, employeeId, contact, shift } = req.body;

    if (!name || !email || !password || !role) {
      return sendError(res, 'name, email, password, and role are required', 400);
    }

    if (!['collector', 'staff'].includes(role)) {
      return sendError(res, 'Admin can only create collector or staff accounts', 400);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, 'Email is already taken', 400);

    let profilePhotoUrl;
    if (req.file) {
      const uploadedPhoto = await uploadPhoto(req.file.buffer, 'resiklean/profiles');
      profilePhotoUrl = uploadedPhoto.url;
    }

    const user = await User.create({
      name, email, password, role,
      employeeId: employeeId || undefined,
      contact: contact || undefined,
      shift: shift || undefined,
      profilePhotoUrl,
    });

    // Convert to object and remove password for response
    const userResponse = user.toObject();
    delete userResponse.password;

    sendSuccess(res, userResponse, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/routes ─────────────────────────────────────────────────────
// Returns all routes with their assigned collector info.
const getAllRoutes = async (req, res) => {
  try {
    const routes = await Route.find()
      .populate('collectorId', 'name email')
      .sort({ barangay: 1, name: 1 })
      .lean();

    sendSuccess(res, { count: routes.length, routes });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/admin/routes ────────────────────────────────────────────────────
// Creates a new collection route.
// Body: { name, barangay, schedule: [0-6], stops: [{ name, latitude, longitude, order }], collectorId? }
const createRoute = async (req, res) => {
  try {
    const { name, barangay, schedule, stops, collectorId, areaBoundary } = req.body;

    if (!name || !barangay || !schedule || !stops) {
      return sendError(res, 'name, barangay, schedule, and stops are required', 400);
    }

    const route = await Route.create({ name, barangay, schedule, stops, collectorId, areaBoundary });
    sendSuccess(res, route, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/admin/routes/:routeId/assign ───────────────────────────────────
// Assigns a collector to a route.
// Body: { collectorId }
const assignCollector = async (req, res) => {
  try {
    const { routeId } = req.params;
    const { collectorId } = req.body;

    const collector = await User.findOne({ _id: collectorId, role: 'collector' });
    if (!collector) return sendError(res, 'Collector not found', 404);

    const route = await Route.findByIdAndUpdate(
      routeId,
      { collectorId },
      { new: true }
    ).populate('collectorId', 'name email');

    if (!route) return sendError(res, 'Route not found', 404);

    sendSuccess(res, route);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/admin/routes/:routeId ──────────────────────────────────────────
// Updates an existing route's details (schedule, name, barangay, stops, etc.)
// Body: any combination of { name, barangay, schedule, stops, routePath, isActive }
const updateRoute = async (req, res) => {
  try {
    const { routeId } = req.params;

    // Only allow these fields to be updated
    const allowedFields = ['name', 'barangay', 'schedule', 'stops', 'routePath', 'isActive'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, 'No valid fields provided to update', 400);
    }

    const route = await Route.findByIdAndUpdate(routeId, updates, { new: true })
      .populate('collectorId', 'name email');

    if (!route) return sendError(res, 'Route not found', 404);

    sendSuccess(res, route);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/compliance ─────────────────────────────────────────────────
// Returns a compliance summary per route for a given date.
// Query: ?date=YYYY-MM-DD (defaults to today)
const getComplianceReport = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();

    // Derive eventDate string (YYYY-MM-DD) in Manila timezone
    const eventDate = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Manila',
    }).format(dateParam);

    const dayOfWeek = dateParam.getDay();

    // Only routes scheduled to run on this day
    const routes = await Route.find({ schedule: dayOfWeek, isActive: true })
      .populate('collectorId', 'name')
      .lean();

    const report = await Promise.all(
      routes.map(async (route) => {
        const logs = await RouteLog.find({
          routeId: route._id,
          eventDate,
        }).lean();

        const totalStops = route.stops.length;
        const collected = logs.filter((l) => l.status === 'collected').length;

        return {
          routeId: route._id,
          routeName: route.name,
          barangay: route.barangay,
          collector: route.collectorId?.name || 'Unassigned',
          totalStops,
          collected,
          remaining: totalStops - logs.length,
          complianceRate: totalStops
            ? `${((collected / totalStops) * 100).toFixed(1)}%`
            : '0%',
        };
      })
    );

    sendSuccess(res, { date: eventDate, report });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/reports ────────────────────────────────────────────────────
// Returns all missed collection reports. Supports ?status= filter.
const getAllReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};

    const reports = await MissedReport.find(filter)
      .populate('residentId', 'name email barangay')
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, { count: reports.length, reports });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/admin/reports/:reportId ────────────────────────────────────────
// Admin updates a missed report status (verified → resolved, etc.)
const updateReportStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['pending', 'verified', 'rejected', 'resolved'];
    if (!allowed.includes(status)) {
      return sendError(res, `Status must be one of: ${allowed.join(', ')}`, 400);
    }

    const update = { status };
    if (status === 'resolved') update.resolvedAt = new Date();

    const report = await MissedReport.findByIdAndUpdate(
      req.params.reportId,
      update,
      { new: true }
    ).populate('residentId', 'name email');

    if (!report) return sendError(res, 'Report not found', 404);

    // Emit real-time event for connected clients
    if (socketService.emitToComplaint) {
      socketService.emitToComplaint('complaint:status-updated', report.residentId._id || report.residentId, {
        reportId: report._id,
        status: report.status,
        report,
      });
    } else {
      socketService.emit('complaint:status-updated', {
        reportId: report._id,
        status: report.status,
        report,
      });
    }

    sendSuccess(res, report);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/tonnage ────────────────────────────────────────────────────
// Returns aggregate tonnage for a date range.
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD
const getTonnageSummary = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = {};
    if (from || to) {
      filter.arrivedAt = {};
      if (from) filter.arrivedAt.$gte = new Date(from);
      if (to) filter.arrivedAt.$lte = new Date(to);
    }

    const loads = await TruckLoad.find(filter)
      .populate('staffId', 'name')
      .populate('routeId', 'name barangay')
      .sort({ arrivedAt: -1 })
      .lean();

    const totalVolume = loads.reduce((s, l) => s + (l.volumeCubicM || 0), 0);
    const totalTonnes = loads.reduce((s, l) => s + (l.tonnesEstimate || 0), 0);

    sendSuccess(res, {
      count: loads.length,
      totalVolumeCubicM: +totalVolume.toFixed(3),
      totalTonnesEstimate: +totalTonnes.toFixed(3),
      loads,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/admin/trucks ────────────────────────────────────────────────────
// Registers a new truck in the fleet.
// Body: { plateNumber, truckNumber, color, length, width, height, availability? }
// Capacity (cu.m.) is auto-computed from length × width × height.
const createTruck = async (req, res) => {
  try {
    const { plateNumber, truckNumber, color, length, width, height, availability } = req.body;

    if (!plateNumber || !truckNumber || !color || length == null || width == null || height == null) {
      return sendError(res, 'plateNumber, truckNumber, color, length, width, and height are required', 400);
    }

    if (length <= 0 || width <= 0 || height <= 0) {
      return sendError(res, 'All dimensions must be positive numbers', 400);
    }

    if (availability && !['available', 'unavailable'].includes(availability)) {
      return sendError(res, 'availability must be either "available" or "unavailable"', 400);
    }

    // Check uniqueness of plateNumber and truckNumber
    const existingPlate = await Truck.findOne({ plateNumber: plateNumber.toUpperCase() });
    if (existingPlate) return sendError(res, 'A truck with this plate number already exists', 409);

    const existingNumber = await Truck.findOne({ truckNumber });
    if (existingNumber) return sendError(res, 'A truck with this truck number already exists', 409);

    const truck = await Truck.create({
      plateNumber,
      truckNumber,
      color,
      length,
      width,
      height,
      availability: availability || 'available',
      registeredBy: req.user._id,
    });

    sendSuccess(res, truck, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── PATCH /api/admin/trucks/:truckId ──────────────────────────────────────────
// Edit truck details. Capacity is recalculated automatically from dimensions.
// Body: any combination of { plateNumber, truckNumber, color, length, width, height, availability }
const updateTruck = async (req, res) => {
  try {
    const { truckId } = req.params;
    const allowedFields = ['plateNumber', 'truckNumber', 'color', 'length', 'width', 'height', 'availability'];
    const updates = {};

    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return sendError(res, 'No valid fields provided to update', 400);
    }

    // Validate positive numbers if provided
    for (const numField of ['length', 'width', 'height']) {
      if (updates[numField] !== undefined && updates[numField] <= 0) {
        return sendError(res, `${numField} must be a positive number`, 400);
      }
    }

    // Validate availability if provided
    if (updates.availability && !['available', 'unavailable'].includes(updates.availability)) {
      return sendError(res, 'availability must be either "available" or "unavailable"', 400);
    }

    // Check uniqueness if plateNumber or truckNumber is being changed
    if (updates.plateNumber) {
      const dup = await Truck.findOne({ plateNumber: updates.plateNumber.toUpperCase(), _id: { $ne: truckId } });
      if (dup) return sendError(res, 'A truck with this plate number already exists', 409);
    }
    if (updates.truckNumber) {
      const dup = await Truck.findOne({ truckNumber: updates.truckNumber, _id: { $ne: truckId } });
      if (dup) return sendError(res, 'A truck with this truck number already exists', 409);
    }

    const truck = await Truck.findByIdAndUpdate(truckId, updates, { new: true, runValidators: true });
    if (!truck) return sendError(res, 'Truck not found', 404);

    sendSuccess(res, truck);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── DELETE /api/admin/trucks/:truckId ─────────────────────────────────────────
// Soft-delete: sets isActive to false and records removedAt timestamp.
const archiveTruck = async (req, res) => {
  try {
    const { truckId } = req.params;

    const truck = await Truck.findByIdAndUpdate(
      truckId,
      { isActive: false, removedAt: new Date() },
      { new: true }
    );

    if (!truck) return sendError(res, 'Truck not found', 404);

    sendSuccess(res, truck);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/admin/cycle-logs ────────────────────────────────────────────────
// Admin assigns a driver (Collector) to a truck for a shift.
// Body: { driverId, truckId, shiftStart? }
const createCycleLog = async (req, res) => {
  try {
    const { driverId, truckId, shiftStart } = req.body;

    if (!driverId || !truckId) {
      return sendError(res, 'driverId and truckId are required', 400);
    }

    // Verify the driver is a collector
    const driver = await User.findOne({ _id: driverId, role: 'collector' });
    if (!driver) return sendError(res, 'Driver not found or is not a Collector', 404);

    // Verify the truck exists
    const truck = await Truck.findOne({ _id: truckId, isActive: true });
    if (!truck) return sendError(res, 'Truck not found or inactive', 404);

    const truckInUse = await DailyCycleLog.findOne({
      truckId,
      shiftStatus: 'active',
      driverId: { $ne: driverId },
    }).populate('driverId', 'name employeeId').lean();
    if (truckInUse) {
      return sendError(res, `This truck is already assigned to ${truckInUse.driverId?.name || 'another driver'}.`, 409);
    }

    // Assignment is per driver and shift. Updating the dropdown closes the
    // driver's previous active cycle before opening the new truck assignment.
    const previousCycle = await DailyCycleLog.findOne({ driverId, shiftStatus: 'active' }).sort({ shiftStart: -1 });
    if (previousCycle && String(previousCycle.truckId) === String(truckId)) {
      const existing = await DailyCycleLog.findById(previousCycle._id)
        .populate('driverId', 'name employeeId')
        .populate('truckId', 'plateNumber truckNumber color')
        .lean();
      return sendSuccess(res, existing);
    }
    if (previousCycle) {
      previousCycle.shiftStatus = 'completed';
      previousCycle.shiftEnd = new Date();
      await previousCycle.save();
    }

    const cycle = await DailyCycleLog.create({
      driverId,
      truckId,
      shiftStart: shiftStart || new Date(),
    });

    // Populate driver and truck info before responding
    const populated = await DailyCycleLog.findById(cycle._id)
      .populate('driverId', 'name employeeId')
      .populate('truckId', 'plateNumber truckNumber color')
      .lean();

    sendSuccess(res, populated, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/cycle-logs ─────────────────────────────────────────────────
// Returns all cycle logs. Supports ?status=active filter.
const getCycleLogs = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { shiftStatus: status } : {};

    const logs = await DailyCycleLog.find(filter)
      .populate('driverId', 'name employeeId')
      .populate('truckId', 'plateNumber')
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, { count: logs.length, logs });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

const normalizeFilterDate = (value) => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(d);
};

const findCycleForCollector = async (driverId, eventDate) => {
  if (!driverId || !eventDate) return null;
  const startOfDay = new Date(`${eventDate}T00:00:00.000+08:00`);
  const endOfDay = new Date(`${eventDate}T23:59:59.999+08:00`);
  const cycles = await DailyCycleLog.find({
    driverId,
    $or: [
      { shiftStart: { $gte: startOfDay, $lte: endOfDay } },
      { shiftStart: { $lte: endOfDay }, shiftEnd: { $gte: startOfDay } },
      { shiftStart: { $lte: endOfDay }, shiftEnd: null },
    ],
  })
    .sort({ shiftStart: -1 })
    .limit(1)
    .populate('truckId', 'plateNumber truckNumber color')
    .lean();
  const cycle = cycles[0];
  if (!cycle) return null;
  const truck = cycle.truckId || {};
  return {
    _id: cycle._id,
    shiftStart: cycle.shiftStart,
    shiftEnd: cycle.shiftEnd,
    shiftStatus: cycle.shiftStatus,
    truck: {
      plateNumber: truck.plateNumber,
      truckNumber: truck.truckNumber,
      color: truck.color,
    },
  };
};

const buildSegmentStatus = (logs, route) => {
  const totalStops = route?.stops?.length || 0;
  const collected = logs.filter((l) => l.status === 'collected').length;
  const flaggedCount = logs.filter((l) => l.flaggedForReview).length;
  const missingExit = logs.some((l) => !l.exitedAt);
  if (totalStops > 0 && collected >= totalStops && flaggedCount === 0 && !missingExit) return 'Collected';
  if (flaggedCount > 0 || missingExit) return 'FLAGGED — NOT COLLECTED';
  if (collected > 0) return `Partial — ${collected}/${totalStops}`;
  return 'Not collected';
};

// ── GET /api/admin/route-history ─────────────────────────────────────────────
// Returns aggregate collection rows per (collector, route, eventDate).
// Supports: ?collectorId=, ?routeId=, ?barangay=, ?from=YYYY-MM-DD, ?to=YYYY-MM-DD,
// ?status=(collected|flagged|partial|notcollected), ?page=, ?limit=
const getAllRouteHistory = async (req, res) => {
  try {
    const { collectorId, routeId, barangay, from, to, status, page = 1, limit = 25 } = req.query;
    const fromDate = normalizeFilterDate(from);
    const toDate = normalizeFilterDate(to);

    const routeFilters = {};
    if (routeId) routeFilters._id = routeId;
    if (barangay) routeFilters.barangay = { $elemMatch: { $regex: barangay, $options: 'i' } };
    const routeMap = new Map();
    (await Route.find(routeFilters).select('_id name barangay stops').lean()).forEach((r) => routeMap.set(String(r._id), r));
    if ((routeId || barangay) && !routeMap.size) {
      return sendSuccess(res, {
        count: 0,
        page: 1,
        limit: Math.min(100, Math.max(1, Number(limit) || 25)),
        pages: 0,
        rows: [],
      });
    }

    const logFilters = {};
    if (routeMap.size) logFilters.routeId = { $in: [...routeMap.keys()].map((id) => new mongoose.Types.ObjectId(id)) };
    if (collectorId) logFilters.collectorId = new mongoose.Types.ObjectId(collectorId);
    if (fromDate || toDate) {
      logFilters.eventDate = {};
      if (fromDate) logFilters.eventDate.$gte = fromDate;
      if (toDate) logFilters.eventDate.$lte = toDate;
    }

    const logs = await RouteLog.find(logFilters)
      .populate('collectorId', 'name employeeId email')
      .sort({ eventDate: -1, collectedAt: -1 })
      .lean();

    // A driver can finish a route without logging a stop. Include completed
    // trail sessions as history groups so the admin list still links to the
    // real GPS trail and does not depend on stop-log rows existing.
    const trailSessionFilter = { status: 'completed' };
    if (routeMap.size) trailSessionFilter.routeId = { $in: [...routeMap.keys()] };
    if (collectorId) trailSessionFilter.collectorId = new mongoose.Types.ObjectId(collectorId);
    const trailSessions = await RouteTrailSession.find(trailSessionFilter)
      .sort({ startedAt: -1 })
      .limit(500)
      .lean();

    const groups = new Map();
    logs.forEach((log) => {
      const route = routeMap.get(String(log.routeId)) || null;
      const key = `${String(log.collectorId?._id || log.collectorId)}|${String(log.routeId)}|${log.eventDate}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          collectorId: log.collectorId?._id || log.collectorId,
          collectorName: log.collectorId?.name || 'Unassigned',
          collectorEmployeeId: log.collectorId?.employeeId || '',
          routeId: log.routeId,
          routeName: route?.name || 'Unknown route',
          barangay: route?.barangay || [],
          streetList: route?.stops?.map((s) => s.name) || [],
          eventDate: log.eventDate,
          logs: [],
          totalStops: route?.stops?.length || 0,
          trailSession: null,
        });
      }
      groups.get(key).logs.push(log);
    });

    trailSessions.forEach((session) => {
      const route = routeMap.get(String(session.routeId)) || null;
      if (!route) return;
      const eventDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(session.startedAt));
      if (fromDate && eventDate < fromDate) return;
      if (toDate && eventDate > toDate) return;
      const key = `${String(session.collectorId)}|${String(session.routeId)}|${eventDate}`;
      if (!groups.has(key)) {
        groups.set(key, {
          id: key,
          collectorId: session.collectorId,
          collectorName: 'Unassigned',
          collectorEmployeeId: '',
          routeId: session.routeId,
          routeName: route.name || session.routeName || 'Unknown route',
          barangay: route.barangay || [],
          streetList: route.stops?.map((stop) => stop.name) || [],
          eventDate,
          logs: [],
          totalStops: route.stops?.length || 0,
          trailSession: session,
        });
      } else if (!groups.get(key).trailSession) {
        groups.get(key).trailSession = session;
      }
    });

    const rows = await Promise.all([...groups.values()].map(async (group) => {
      const sortedLogs = [...group.logs].sort((a, b) => new Date(a.collectedAt) - new Date(b.collectedAt));
      const firstCollected = sortedLogs[0]?.collectedAt || group.trailSession?.startedAt || null;
      const lastExit = sortedLogs.reduce((m, l) => !l.exitedAt ? m : (!m || new Date(l.exitedAt) > new Date(m) ? l.exitedAt : m), group.trailSession?.endedAt || null);
      const flaggedCount = sortedLogs.filter((l) => l.flaggedForReview).length;
      const avgDwell = sortedLogs.length ? +(sortedLogs.reduce((s, l) => s + (l.dwellSeconds || 0), 0) / sortedLogs.length).toFixed(1) : 0;
      const collected = sortedLogs.filter((l) => l.status === 'collected').length;
      const cycle = await findCycleForCollector(group.collectorId, group.eventDate);
      let collector = group.collectorName === 'Unassigned' ? null : { name: group.collectorName, employeeId: group.collectorEmployeeId };
      if (!collector) collector = await User.findById(group.collectorId).select('name employeeId').lean();
      const segmentStatus = buildSegmentStatus(sortedLogs, { stops: Array(group.totalStops).fill({}) });
      const rowStatus = flaggedCount > 0 ? 'flagged' : collected >= group.totalStops && group.totalStops > 0 ? 'collected' : collected > 0 ? 'partial' : 'notcollected';
      return {
        id: group.id,
        collectorId: group.collectorId,
        collector: collector?.name || group.collectorName,
        collectorEmployeeId: collector?.employeeId || group.collectorEmployeeId,
        routeId: group.routeId,
        routeName: group.routeName,
        area: Array.isArray(group.barangay) ? group.barangay.filter(Boolean).join(', ') : group.barangay,
        street: group.streetList.length ? `${group.streetList[0]}${group.streetList.length > 1 ? ` · +${group.streetList.length - 1}` : ''}` : group.routeName,
        date: group.eventDate,
        truck: cycle?.truck || null,
        cycle: cycle
          ? {
              shiftStart: cycle.shiftStart,
              shiftEnd: cycle.shiftEnd || null,
              shiftStatus: cycle.shiftStatus || 'active',
            }
          : null,
        geofenceEntry: firstCollected || null,
        geofenceExit: lastExit || null,
        totalStops: group.totalStops,
        collected,
        flaggedCount,
        avgDwellSeconds: avgDwell,
        segmentStatus,
        rowStatus,
        logs: sortedLogs,
      };
    }));

    const filtered = status ? rows.filter((r) => r.rowStatus === status) : rows;
    const pageNum = Math.max(1, Number(page) || 1);
    const pageLimit = Math.min(100, Math.max(1, Number(limit) || 25));
    const total = filtered.length;
    const start = (pageNum - 1) * pageLimit;
    const pageData = filtered.slice(start, start + pageLimit);

    sendSuccess(res, {
      count: total,
      page: pageNum,
      limit: pageLimit,
      pages: Math.ceil(total / pageLimit),
      rows: pageData,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

const resolveGroupKey = async (encodedKey) => {
  const parts = String(encodedKey || '').split('|');
  if (parts.length < 3) return null;
  const [collectorId, routeId, eventDate] = parts;
  if (!collectorId || !routeId || !eventDate) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return null;
  if (!mongoose.Types.ObjectId.isValid(collectorId) || !mongoose.Types.ObjectId.isValid(routeId)) return null;
  return { collectorId: new mongoose.Types.ObjectId(collectorId), routeId: new mongoose.Types.ObjectId(routeId), eventDate };
};

// ── GET /api/admin/route-history/:id ─────────────────────────────────────────
// Returns one route-history record with full detail (logs, trail session, trail points)
// ready to be rendered in the detail modal or PDF.
const getRouteHistoryDetail = async (req, res) => {
  try {
    const key = await resolveGroupKey(req.params.id);
    if (!key) return sendError(res, 'Invalid route history record identifier', 400);
    const { collectorId, routeId, eventDate } = key;

    const [route, collector, logs, sessions] = await Promise.all([
      Route.findById(routeId).lean(),
      User.findById(collectorId).select('name employeeId email barangay location').lean(),
      RouteLog.find({ collectorId, routeId, eventDate }).sort({ collectedAt: 1 }).lean(),
      RouteTrailSession.find({ collectorId, routeId }).sort({ startedAt: -1 }).limit(2).lean(),
    ]);

    if (!route) return sendError(res, 'Route not found', 404);

    const session = sessions.find((s) => {
      const d = new Date(`${eventDate}T12:00:00.000+08:00`);
      const sStart = new Date(s.startedAt);
      const oneDay = 24 * 60 * 60 * 1000;
      return Math.abs(sStart.getTime() - d.getTime()) < oneDay;
    }) || sessions[0] || null;

    const trailPoints = session
      ? await RouteTrailPoint.find({ clientSessionId: session.clientSessionId, collectorId }).sort({ recordedAt: 1 }).lean()
      : [];

    const cycle = await findCycleForCollector(collectorId, eventDate);
    const payload = buildRouteHistoryPayload({
      route,
      collector,
      cycle,
      session,
      logs,
      trailPoints,
      eventDate,
    }, { adminUser: req.user, referenceCounter: 1 });

    sendSuccess(res, {
      ...payload,
      id: req.params.id,
      route,
      collector,
      cycle,
      session,
      logs,
      trailPoints,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/route-history/:id/pdf ─────────────────────────────────────
// Streams a PDF export for a single route-history record.
const exportRouteHistoryPDF = async (req, res) => {
  try {
    const key = await resolveGroupKey(req.params.id);
    if (!key) return sendError(res, 'Invalid route history record identifier', 400);
    const { collectorId, routeId, eventDate } = key;

    const [route, collector, logs, sessions] = await Promise.all([
      Route.findById(routeId).lean(),
      User.findById(collectorId).select('name employeeId email barangay location').lean(),
      RouteLog.find({ collectorId, routeId, eventDate }).sort({ collectedAt: 1 }).lean(),
      RouteTrailSession.find({ collectorId, routeId }).sort({ startedAt: -1 }).limit(2).lean(),
    ]);

    if (!route) return sendError(res, 'Route not found', 404);

    const session = sessions.find((s) => {
      const d = new Date(`${eventDate}T12:00:00.000+08:00`);
      const sStart = new Date(s.startedAt);
      const oneDay = 24 * 60 * 60 * 1000;
      return Math.abs(sStart.getTime() - d.getTime()) < oneDay;
    }) || sessions[0] || null;

    const trailPoints = session
      ? await RouteTrailPoint.find({ clientSessionId: session.clientSessionId, collectorId }).sort({ recordedAt: 1 }).lean()
      : [];

    const cycle = await findCycleForCollector(collectorId, eventDate);
    const payload = buildRouteHistoryPayload({ route, collector, cycle, session, logs, trailPoints, eventDate }, { adminUser: req.user });

    const doc = new PDFDocument({ size: 'LETTER', margin: 46, bufferPages: true });
    const filename = `Route-History-Report-${payload.documentReference.referenceId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Cache-Control', 'no-store, no-cache');

    doc.pipe(res);
    await generateRouteHistoryPDF(doc, payload);
  } catch (err) {
    if (res.headersSent) {
      try { res.end(); } catch {}
      return;
    }
    sendError(res, err.message, 500);
  }
};

// ── GET /api/admin/monitoring/capacity ─────────────────────────────────────────
// Returns every active cycle with its latest capacity log, projection, and status
// without an Alert model or push notifications. Includes TruckLoad comparison
// only when truck plates match, load arrival is after shift start, and both dates match in Manila time.
const getActiveCyclesMonitoring = async (req, res) => {
  try {
    // Get all active cycles
    const activeCycles = await DailyCycleLog.find({ shiftStatus: 'active' })
      .populate('driverId', 'name employeeId')
      .populate('truckId', 'plateNumber truckNumber capacity')
      .lean();

    const result = await Promise.all(activeCycles.map(async (cycle) => {
      // Find latest capacity log for this cycle
      const latestLog = await CapacityLog.findOne({ dailyCycle: cycle._id })
        .sort({ timestamp: -1 })
        .lean();

      let projection = null;
      let status = STATUS_OK;

      if (latestLog) {
        projection = calculateProjection(latestLog);
        status = projection ? projection.status : STATUS_OK;
      }

      // Format cycle shift start in Manila time for date matching
      let truckLoadMatch = null;
      if (cycle.truckId?.plateNumber && cycle.shiftStart) {
        const cycleStartDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(cycle.shiftStart));
        
        // Find matching truck load
        // Must match plate number, arrived after shift start, and be on the same Manila date
        const loads = await TruckLoad.find({
          'truck.plateNumber': cycle.truckId.plateNumber,
          arrivedAt: { $gte: cycle.shiftStart }
        }).sort({ arrivedAt: -1 }).lean();

        for (const load of loads) {
          const loadDateStr = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date(load.arrivedAt));
          if (loadDateStr === cycleStartDateStr) {
            truckLoadMatch = {
              arrivedAt: load.arrivedAt,
              tonnesEstimate: load.tonnesEstimate,
              volumeCubicM: load.volumeCubicM,
              wasteType: load.wasteType
            };
            break; // found the match
          }
        }
      }

      return {
        cycleId: cycle._id,
        driver: cycle.driverId,
        truck: cycle.truckId,
        shiftStart: cycle.shiftStart,
        latestCapacityLog: latestLog || null,
        projection,
        status,
        truckLoadMatch
      };
    }));

    sendSuccess(res, result);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = {
  getAllUsers,
  createUser,
  getAllRoutes,
  createRoute,
  updateRoute,
  assignCollector,
  getComplianceReport,
  getAllReports,
  updateReportStatus,
  getTonnageSummary,
  createTruck,
  updateTruck,
  archiveTruck,
  createCycleLog,
  getCycleLogs,
  getAllRouteHistory,
  getRouteHistoryDetail,
  exportRouteHistoryPDF,
  getActiveCyclesMonitoring,
};
