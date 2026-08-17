const User = require('../models/User');
const Route = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const MissedReport = require('../models/MissedReport');
const TruckLoad = require('../models/TruckLoad');
const Truck = require('../models/Truck');
const { sendSuccess, sendError } = require('../utils/response');

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
// Body: { name, email, password, role }
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !password || !role) {
      return sendError(res, 'name, email, password, and role are required', 400);
    }

    if (!['collector', 'staff'].includes(role)) {
      return sendError(res, 'Admin can only create collector or staff accounts', 400);
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, 'Email is already taken', 400);

    const user = await User.create({ name, email, password, role });

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
    const { name, barangay, schedule, stops, collectorId } = req.body;

    if (!name || !barangay || !schedule || !stops) {
      return sendError(res, 'name, barangay, schedule, and stops are required', 400);
    }

    const route = await Route.create({ name, barangay, schedule, stops, collectorId });
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

// ── GET /api/admin/compliance ─────────────────────────────────────────────────
// Returns a compliance summary per route for a given date.
// Query: ?date=YYYY-MM-DD (defaults to today)
const getComplianceReport = async (req, res) => {
  try {
    const dateParam = req.query.date ? new Date(req.query.date) : new Date();
    const startOfDay = new Date(dateParam.setHours(0, 0, 0, 0));
    const endOfDay = new Date(dateParam.setHours(23, 59, 59, 999));
    const dayOfWeek = startOfDay.getDay();

    // Only routes scheduled to run on this day
    const routes = await Route.find({ schedule: dayOfWeek, isActive: true })
      .populate('collectorId', 'name')
      .lean();

    const report = await Promise.all(
      routes.map(async (route) => {
        const logs = await RouteLog.find({
          routeId: route._id,
          createdAt: { $gte: startOfDay, $lte: endOfDay },
        }).lean();

        const totalStops = route.stops.length;
        const collected = logs.filter((l) => l.status === 'collected').length;
        const skipped = logs.filter((l) => l.status === 'skipped').length;

        return {
          routeId: route._id,
          routeName: route.name,
          barangay: route.barangay,
          collector: route.collectorId?.name || 'Unassigned',
          totalStops,
          collected,
          skipped,
          remaining: totalStops - logs.length,
          complianceRate: totalStops
            ? `${((collected / totalStops) * 100).toFixed(1)}%`
            : '0%',
        };
      })
    );

    sendSuccess(res, { date: startOfDay.toISOString().split('T')[0], report });
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
// Body: { plateNumber, length, width, height }
const createTruck = async (req, res) => {
  try {
    const { plateNumber, length, width, height } = req.body;

    if (!plateNumber || length == null || width == null || height == null) {
      return sendError(res, 'plateNumber, length, width, and height are required', 400);
    }

    const existing = await Truck.findOne({ plateNumber: plateNumber.toUpperCase() });
    if (existing) return sendError(res, 'A truck with this plate number already exists', 409);

    const truck = await Truck.create({
      plateNumber,
      length,
      width,
      height,
      registeredBy: req.user._id,
    });

    sendSuccess(res, truck, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = {
  getAllUsers,
  createUser,
  getAllRoutes,
  createRoute,
  assignCollector,
  getComplianceReport,
  getAllReports,
  updateReportStatus,
  getTonnageSummary,
  createTruck,
};
