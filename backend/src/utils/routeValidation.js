/**
 * routeValidation.js — Validation helpers for Admin Route Management API
 *
 * Validates routePath geometry (LineString / MultiLineString), stop objects,
 * and provides proximity warnings using Turf nearestPointOnLine.
 */

const nearestPointOnLine = require('@turf/nearest-point-on-line').default;
const { lineString, multiLineString, point } = require('@turf/helpers');

// ── Geometry validation ─────────────────────────────────────────────────────

/**
 * Returns true when [lng, lat] is a valid WGS-84 position.
 */
const isValidPosition = (pos) =>
  Array.isArray(pos) &&
  pos.length >= 2 &&
  Number.isFinite(pos[0]) &&
  Number.isFinite(pos[1]) &&
  pos[0] >= -180 && pos[0] <= 180 &&
  pos[1] >= -90 && pos[1] <= 90;

/**
 * Validates a single line (array of positions). Each line needs ≥ 2 valid positions.
 * Returns { valid: boolean, error?: string }
 */
const validateLine = (coords, label = 'Line') => {
  if (!Array.isArray(coords) || coords.length < 2) {
    return { valid: false, error: `${label} must have at least 2 coordinate positions` };
  }
  for (let i = 0; i < coords.length; i++) {
    if (!isValidPosition(coords[i])) {
      return { valid: false, error: `${label} position [${i}] is not a valid [longitude, latitude]` };
    }
  }
  return { valid: true };
};

/**
 * Validates a routePath object (LineString or MultiLineString).
 * Returns { valid: boolean, error?: string }
 */
const validateRoutePath = (routePath) => {
  if (!routePath || typeof routePath !== 'object') {
    return { valid: false, error: 'routePath is required and must be an object' };
  }

  const { type, coordinates } = routePath;

  if (type === 'LineString') {
    return validateLine(coordinates, 'LineString');
  }

  if (type === 'MultiLineString') {
    if (!Array.isArray(coordinates) || coordinates.length === 0) {
      return { valid: false, error: 'MultiLineString coordinates must be a non-empty array of line arrays' };
    }
    for (let i = 0; i < coordinates.length; i++) {
      const result = validateLine(coordinates[i], `MultiLineString line [${i}]`);
      if (!result.valid) return result;
    }
    return { valid: true };
  }

  return { valid: false, error: `routePath.type must be "LineString" or "MultiLineString", got "${type}"` };
};

// ── Stop validation ─────────────────────────────────────────────────────────

/**
 * Validates an array of stop objects.
 * Returns { valid: boolean, error?: string }
 */
const validateStops = (stops) => {
  if (!Array.isArray(stops) || stops.length === 0) {
    return { valid: false, error: 'At least one stop is required' };
  }

  const ordersSeen = new Set();

  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    const label = `Stop [${i}]`;

    // Name is required
    if (!stop.name || typeof stop.name !== 'string' || !stop.name.trim()) {
      return { valid: false, error: `${label} must have a non-empty name` };
    }

    // Order is required and must be a positive integer
    if (!Number.isFinite(stop.order) || stop.order < 1 || !Number.isInteger(stop.order)) {
      return { valid: false, error: `${label} order must be a positive integer` };
    }

    // Order must be unique
    if (ordersSeen.has(stop.order)) {
      return { valid: false, error: `${label} has duplicate order value ${stop.order}` };
    }
    ordersSeen.add(stop.order);

    // Coordinates are optional but must be valid if provided
    if (stop.latitude != null || stop.longitude != null) {
      if (!Number.isFinite(stop.latitude) || stop.latitude < -90 || stop.latitude > 90) {
        return { valid: false, error: `${label} latitude must be between -90 and 90` };
      }
      if (!Number.isFinite(stop.longitude) || stop.longitude < -180 || stop.longitude > 180) {
        return { valid: false, error: `${label} longitude must be between -180 and 180` };
      }
    }
  }

  return { valid: true };
};

// ── Proximity warnings ──────────────────────────────────────────────────────

const DISTANCE_WARN_METRES = 100;
const MAX_ACTIVE_STOPS_WARN = 100;

/**
 * Checks each stop with coordinates against the routePath. Returns an
 * array of warning strings (empty = no warnings).
 */
const getStopProximityWarnings = (stops, routePath) => {
  const warnings = [];
  if (!routePath || !routePath.coordinates) return warnings;

  let line;
  try {
    if (routePath.type === 'LineString') {
      line = lineString(routePath.coordinates);
    } else if (routePath.type === 'MultiLineString') {
      // For MultiLineString, check each stop against the nearest line segment
      line = multiLineString(routePath.coordinates);
    }
  } catch {
    return warnings; // Can't build turf geometry — skip proximity check
  }

  if (!line) return warnings;

  // For MultiLineString we need to check each sub-line individually and
  // take the minimum distance. nearestPointOnLine only accepts LineString.
  const lines = routePath.type === 'MultiLineString'
    ? routePath.coordinates.map((coords) => {
        try { return lineString(coords); } catch { return null; }
      }).filter(Boolean)
    : [line];

  for (const stop of stops) {
    if (stop.latitude == null || stop.longitude == null) continue;

    try {
      const pt = point([stop.longitude, stop.latitude]);
      let minDist = Infinity;

      for (const l of lines) {
        const snapped = nearestPointOnLine(l, pt, { units: 'meters' });
        if (snapped.properties.dist < minDist) {
          minDist = snapped.properties.dist;
        }
      }

      if (minDist > DISTANCE_WARN_METRES) {
        warnings.push(
          `Stop "${stop.name}" (order ${stop.order}) is ~${Math.round(minDist)}m from the nearest point on the route path (threshold: ${DISTANCE_WARN_METRES}m)`
        );
      }
    } catch {
      // Individual stop proximity check failed — skip silently
    }
  }

  // High stop count warning
  const activeStops = stops.filter((s) => !s.isArchived);
  if (activeStops.length > MAX_ACTIVE_STOPS_WARN) {
    warnings.push(`Route has ${activeStops.length} active stops (over the recommended limit of ${MAX_ACTIVE_STOPS_WARN})`);
  }

  return warnings;
};

module.exports = {
  isValidPosition,
  validateRoutePath,
  validateStops,
  getStopProximityWarnings,
  DISTANCE_WARN_METRES,
  MAX_ACTIVE_STOPS_WARN,
};
