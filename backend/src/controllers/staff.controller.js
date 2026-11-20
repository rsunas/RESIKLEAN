const mongoose = require('mongoose');
const TruckLoad = require('../models/TruckLoad');
const { validateTruckDimensions } = require('../utils/truckDimensions');
const Route = require('../models/Route');
const User = require('../models/User');
const DailyCycleLog = require('../models/DailyCycleLog');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');

// ── POST /api/staff/truckloads ────────────────────────────────────────────────
// Staff submits a truckload entry at the sanitary landfill.
// Volume (m³) and tonnage estimate are auto-calculated by the model's pre-save hook.
// Body: { truckPlate, routeId?, length, width, height, slope?, notes? }
// Measurements are in metres.
const submitTruckLoad = async (req, res) => {
  try {
    const { truckPlate, routeId, length, width, height, slope, notes, clientSubmissionId } = req.body;
    const normalizedClientSubmissionId = typeof clientSubmissionId === 'string'
      ? clientSubmissionId.trim()
      : '';

    // A mobile retry can happen after the server has already saved the upload but
    // before the response reaches the device. Return the original record instead
    // of creating a second truckload.
    if (normalizedClientSubmissionId) {
      const existingLoad = await TruckLoad.findOne({
        clientSubmissionId: normalizedClientSubmissionId,
        staffId: req.user._id,
      });
      if (existingLoad) return sendSuccess(res, existingLoad, 200);
    }

    if (!truckPlate || !length || !width || !height) {
      return sendError(res, 'truckPlate, length, width, and height are required', 400);
    }

    const dimensionError = validateTruckDimensions({ length, width, height });
    if (dimensionError) return sendError(res, dimensionError, 400);

    let pileHeightsCm;
    let pileVolume = slope ? Number(slope) : 0;
    if (req.body.pileHeightsCm !== undefined) {
      try {
        pileHeightsCm = typeof req.body.pileHeightsCm === 'string' ? JSON.parse(req.body.pileHeightsCm) : req.body.pileHeightsCm;
      } catch { return sendError(res, 'Invalid pile heights', 400); }
      if (!pileHeightsCm || !['front', 'middle', 'back'].every(key => typeof pileHeightsCm[key] === 'number' && Number.isFinite(pileHeightsCm[key]) && pileHeightsCm[key] >= 0)) {
        return sendError(res, 'Front, middle, and back heights must be non-negative centimetres', 400);
      }
      pileHeightsCm = Object.fromEntries(['front', 'middle', 'back'].map(key => [key, pileHeightsCm[key]]));
      pileVolume = Number(length) * Number(width) * (pileHeightsCm.front + pileHeightsCm.middle + pileHeightsCm.back) / 300;
    }
    if (!Number.isFinite(pileVolume) || pileVolume < 0) return sendError(res, 'Invalid pile volume', 400);

    // Validate routeId if provided
    let validatedRouteId = null;
    if (routeId) {
      const isValidObjectId = mongoose.Types.ObjectId.isValid(routeId);
      const route = isValidObjectId ? await Route.findById(routeId).lean() : null;
      let matchedRoute = route;
      if (!matchedRoute && typeof req.body.area === 'string' && req.body.area.trim()) {
        const areaQuery = req.body.area.trim().replace(/^Area\s+/i, '');
        matchedRoute = await Route.findOne({
          isActive: true,
          $or: [
            { name: new RegExp(req.body.area.trim(), 'i') },
            { name: new RegExp(`Area ${areaQuery}`, 'i') },
            { barangay: new RegExp(req.body.area.trim(), 'i') },
          ],
        }).lean();
      }
      if (!matchedRoute) {
        return sendError(res, 'Invalid route ID — route not found', 400);
      }
      if (!matchedRoute.isActive) {
        return sendError(res, 'This route is inactive and cannot be assigned to a truckload', 400);
      }
      validatedRouteId = matchedRoute._id;
    } else if (typeof req.body.area === 'string' && req.body.area.trim()) {
      const areaQuery = req.body.area.trim().replace(/^Area\s+/i, '');
      const matchedRoute = await Route.findOne({
        isActive: true,
        $or: [
          { name: new RegExp(req.body.area.trim(), 'i') },
          { name: new RegExp(`Area ${areaQuery}`, 'i') },
          { barangay: new RegExp(req.body.area.trim(), 'i') },
        ],
      }).lean();
      if (matchedRoute) validatedRouteId = matchedRoute._id;
    }

    let photoUrl, sidePhotoUrl, backPhotoUrl;
    let sidePhotoMetadata = {};
    let backPhotoMetadata = {};

    const files = req.files || {};
    if (files.sidePhoto?.[0]) {
      sidePhotoUrl = (await uploadPhoto(files.sidePhoto[0].buffer, 'resiklean/truckloads')).url;
      try { if (req.body.sidePhotoMetadata) sidePhotoMetadata = JSON.parse(req.body.sidePhotoMetadata); } catch {}
    }
    if (files.backPhoto?.[0]) {
      backPhotoUrl = (await uploadPhoto(files.backPhoto[0].buffer, 'resiklean/truckloads')).url;
      try { if (req.body.backPhotoMetadata) backPhotoMetadata = JSON.parse(req.body.backPhotoMetadata); } catch {}
    }
    if (files.photo?.[0]) photoUrl = (await uploadPhoto(files.photo[0].buffer, 'resiklean/truckloads')).url;

    const load = await TruckLoad.create({
      staffId: req.user._id,
      clientSubmissionId: normalizedClientSubmissionId || undefined,
      truckPlate: truckPlate.toUpperCase(),
      routeId: validatedRouteId,
      length: Number(length),
      width: Number(width),
      height: Number(height),
      slope: pileVolume,
      pileHeightsCm,
      notes: notes || '',
      photoUrl,
      sidePhotoUrl,
      backPhotoUrl,
      sidePhotoMetadata,
      backPhotoMetadata
    });

    sendSuccess(res, load, 201);
  } catch (err) {
    // Handle a concurrent retry that reaches the unique index before the first
    // request has returned. Treat it as an idempotent success as well.
    if (err?.code === 11000 && err?.keyPattern?.clientSubmissionId && req.body?.clientSubmissionId) {
      const existingLoad = await TruckLoad.findOne({
        clientSubmissionId: String(req.body.clientSubmissionId).trim(),
        staffId: req.user._id,
      });
      if (existingLoad) return sendSuccess(res, existingLoad, 200);
    }
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
      if (to) filter.arrivedAt.$lte = new Date(to);
    }

    const loads = await TruckLoad.find(filter)
      .populate('routeId', 'name barangay')
      .sort({ arrivedAt: -1 })
      .lean();

    // Normalize legacy rows that were saved before the model's pre-save
    // calculation existed. Dimensions are metres and slope is cubic metres.
    // Keeping this fallback on read makes old history entries consistent with
    // new entries without requiring a destructive database migration.
    const normalizedLoads = loads.map((load) => {
      const length = Number(load.length || 0);
      const width = Number(load.width || 0);
      const height = Number(load.height || 0);
      const slope = Number(load.slope || 0);
      const densityFactor = Number(load.densityFactor) > 0 ? Number(load.densityFactor) : 0.294;
      const volumeCubicM = length > 0 && width > 0 && height > 0 ? length * width * height : Number(load.volumeCubicM || 0);
      const tonnesEstimate = volumeCubicM > 0
        ? (volumeCubicM + slope) * densityFactor
        : Number(load.tonnesEstimate || 0);

      return { ...load, volumeCubicM, tonnesEstimate, densityFactor };
    });

    // Summary totals
    const totalVolume = normalizedLoads.reduce((sum, l) => sum + (l.volumeCubicM || 0), 0);
    const totalTonnes = normalizedLoads.reduce((sum, l) => sum + (l.tonnesEstimate || 0), 0);

    sendSuccess(res, {
      count: loads.length,
      totalVolumeCubicM: +totalVolume.toFixed(3),
      totalTonnesEstimate: +totalTonnes.toFixed(3),
      loads: normalizedLoads,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/staff/areas ──────────────────────────────────────────────────────
// Returns active routes with _id, barangay, and name.
// Used to populate the Area dropdown in the Staff mobile app.
const getAreas = async (req, res) => {
  try {
    const areas = await Route.find({ isActive: true })
      .select('_id barangay name')
      .sort({ barangay: 1, name: 1 })
      .lean();

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
