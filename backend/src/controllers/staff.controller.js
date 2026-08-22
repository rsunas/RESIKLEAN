const TruckLoad = require('../models/TruckLoad');
const Route     = require('../models/Route');
const User      = require('../models/User');
const DailyCycleLog = require('../models/DailyCycleLog');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');

// ── POST /api/staff/truckloads ────────────────────────────────────────────────
// Staff submits a truckload entry at the sanitary landfill.
// Volume (m³) and tonnage estimate are auto-calculated by the model's pre-save hook.
// Body: { truckPlate, routeId?, length, width, height, slope?, notes? }
// Measurements are in centimetres.
const submitTruckLoad = async (req, res) => {
  try {
    const { truckPlate, routeId, length, width, height, slope, notes } = req.body;

    if (!truckPlate || !length || !width || !height) {
      return sendError(res, 'truckPlate, length, width, and height are required', 400);
    }

    if (!req.file) {
      return sendError(res, 'Audit photo is required', 400);
    }

    // Upload audit photo to Cloudinary
    const result = await uploadPhoto(req.file.buffer, 'resiklean/truckloads');
    const photoUrl = result.url;

    const load = await TruckLoad.create({
      staffId: req.user._id,
      truckPlate: truckPlate.toUpperCase(),
      routeId: routeId || null,
      length: Number(length),
      width:  Number(width),
      height: Number(height),
      slope:  slope ? Number(slope) : 0,
      notes:  notes || '',
      photoUrl,
    });

    sendSuccess(res, load, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/staff/truckloads ─────────────────────────────────────────────────
// Returns truckloads submitted by the logged-in staff member.
// Supports ?from=YYYY-MM-DD&to=YYYY-MM-DD date range filter.
const getMyTruckLoads = async (req, res) => {
  try {
    const { from, to } = req.query;
    const filter = { staffId: req.user._id };

    if (from || to) {
      filter.arrivedAt = {};
      if (from) filter.arrivedAt.$gte = new Date(from);
      if (to)   filter.arrivedAt.$lte = new Date(to);
    }

    const loads = await TruckLoad.find(filter)
      .populate('routeId', 'name barangay')
      .sort({ arrivedAt: -1 })
      .lean();

    // Summary totals
    const totalVolume  = loads.reduce((sum, l) => sum + (l.volumeCubicM  || 0), 0);
    const totalTonnes  = loads.reduce((sum, l) => sum + (l.tonnesEstimate || 0), 0);

    sendSuccess(res, {
      count: loads.length,
      totalVolumeCubicM:   +totalVolume.toFixed(3),
      totalTonnesEstimate: +totalTonnes.toFixed(3),
      loads,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/staff/areas ──────────────────────────────────────────────────────
// Returns a sorted list of unique barangay/area names from the routes collection.
// Used to populate the Area dropdown in the Staff mobile app.
const getAreas = async (req, res) => {
  try {
    const areas = await Route.distinct('barangay', { isActive: true });
    areas.sort((a, b) => a.localeCompare(b));

    sendSuccess(res, { count: areas.length, areas });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/staff/drivers ────────────────────────────────────────────────────
// Returns a list of Collector users (name + id) for the Driver dropdown.
const getDrivers = async (req, res) => {
  try {
    const drivers = await User.find({ role: 'collector' })
      .select('name _id')
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, { count: drivers.length, drivers });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/staff/drivers/by-truck/:truckId ─────────────────────────────────
// Returns the driver currently assigned to the given truck for the active shift.
// Used to auto-fill the Driver dropdown when Staff selects a truck.
const getDriverByTruck = async (req, res) => {
  try {
    const { truckId } = req.params;

    // Find the most recent active cycle for this truck
    const cycle = await DailyCycleLog.findOne({
      truckId,
      shiftStatus: 'active',
    })
      .populate('driverId', 'name _id employeeId')
      .sort({ shiftStart: -1 })
      .lean();

    if (!cycle) {
      return sendError(res, 'No active driver assigned to this truck', 404);
    }

    sendSuccess(res, { driver: cycle.driverId });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { submitTruckLoad, getMyTruckLoads, getAreas, getDrivers, getDriverByTruck };
