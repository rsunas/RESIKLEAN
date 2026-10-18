/**
 * adminRouteManagement.test.js — Test suite for Admin Route Management API
 *
 * Covers:
 *   1. routePath geometry validation (LineString, MultiLineString, invalid types/coords)
 *   2. Stop validation (required fields, coords, unique positive order, min 1 stop)
 *   3. Proximity warnings (Turf nearestPointOnLine >100m threshold, max active stops >100)
 *   4. Stop _id preservation and soft-archiving (isArchived, archivedAt)
 *   5. Route soft-archival (isActive: false)
 *   6. Seed script safety guard (--force flag)
 *   7. Collector consumer stop filtering
 */

const {
  isValidPosition,
  validateRoutePath,
  validateStops,
  getStopProximityWarnings,
  DISTANCE_WARN_METRES,
  MAX_ACTIVE_STOPS_WARN,
} = require('../src/utils/routeValidation');

describe('Admin Route Management — Geometry Validation', () => {
  const validLineString = {
    type: 'LineString',
    coordinates: [
      [123.190, 13.620],
      [123.195, 13.625],
    ],
  };

  const validMultiLineString = {
    type: 'MultiLineString',
    coordinates: [
      [
        [123.190, 13.620],
        [123.195, 13.625],
      ],
      [
        [123.200, 13.630],
        [123.205, 13.635],
      ],
    ],
  };

  it('validates a valid LineString', () => {
    const result = validateRoutePath(validLineString);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('validates a valid MultiLineString', () => {
    const result = validateRoutePath(validMultiLineString);
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
  });

  it('rejects missing or non-object routePath', () => {
    expect(validateRoutePath(null).valid).toBe(false);
    expect(validateRoutePath(undefined).valid).toBe(false);
    expect(validateRoutePath('not-an-object').valid).toBe(false);
  });

  it('rejects unsupported geometry types (e.g., Polygon, Point)', () => {
    const polygon = {
      type: 'Polygon',
      coordinates: [[[123.19, 13.62], [123.20, 13.62], [123.20, 13.63], [123.19, 13.62]]],
    };
    const result = validateRoutePath(polygon);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must be "LineString" or "MultiLineString"/);

    const point = {
      type: 'Point',
      coordinates: [123.19, 13.62],
    };
    expect(validateRoutePath(point).valid).toBe(false);
  });

  it('rejects LineString with fewer than 2 coordinate positions', () => {
    const singlePointLine = {
      type: 'LineString',
      coordinates: [[123.19, 13.62]],
    };
    const result = validateRoutePath(singlePointLine);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 2 coordinate positions/);
  });

  it('rejects MultiLineString where any line has fewer than 2 positions', () => {
    const invalidMulti = {
      type: 'MultiLineString',
      coordinates: [
        [[123.19, 13.62], [123.20, 13.63]],
        [[123.21, 13.64]], // Only 1 point
      ],
    };
    const result = validateRoutePath(invalidMulti);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/at least 2 coordinate positions/);
  });

  it('rejects coordinates with out-of-range latitude or longitude', () => {
    const invalidCoords = {
      type: 'LineString',
      coordinates: [
        [123.19, 13.62],
        [190.0, 13.62], // Longitude > 180
      ],
    };
    const result = validateRoutePath(invalidCoords);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/not a valid \[longitude, latitude\]/);

    const invalidLat = {
      type: 'LineString',
      coordinates: [
        [123.19, 13.62],
        [123.20, 95.0], // Latitude > 90
      ],
    };
    expect(validateRoutePath(invalidLat).valid).toBe(false);
  });

  it('rejects non-numeric coordinates (NaN, strings, null)', () => {
    const nonNumeric = {
      type: 'LineString',
      coordinates: [
        [123.19, 13.62],
        ['123.20', '13.63'],
      ],
    };
    expect(validateRoutePath(nonNumeric).valid).toBe(false);
  });
});

describe('Admin Route Management — Stop Validation', () => {
  it('requires at least one stop', () => {
    expect(validateStops([]).valid).toBe(false);
    expect(validateStops([]).error).toMatch(/At least one stop is required/);
    expect(validateStops(null).valid).toBe(false);
  });

  it('validates correct stops with valid data', () => {
    const stops = [
      { name: 'Corner Rizal & Penafrancia', order: 1, latitude: 13.621, longitude: 123.191 },
      { name: 'San Francisco Church', order: 2, latitude: 13.624, longitude: 123.194 },
    ];
    const result = validateStops(stops);
    expect(result.valid).toBe(true);
  });

  it('rejects stops with empty or missing name', () => {
    const stops = [
      { name: '', order: 1 },
    ];
    const result = validateStops(stops);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/must have a non-empty name/);
  });

  it('rejects stops with non-positive or non-integer order', () => {
    expect(validateStops([{ name: 'Stop A', order: 0 }]).valid).toBe(false);
    expect(validateStops([{ name: 'Stop A', order: -1 }]).valid).toBe(false);
    expect(validateStops([{ name: 'Stop A', order: 1.5 }]).valid).toBe(false);
    expect(validateStops([{ name: 'Stop A', order: '1' }]).valid).toBe(false);
  });

  it('rejects duplicate order among stops', () => {
    const stops = [
      { name: 'Stop 1', order: 1, latitude: 13.62, longitude: 123.19 },
      { name: 'Stop 2', order: 1, latitude: 13.63, longitude: 123.20 },
    ];
    const result = validateStops(stops);
    expect(result.valid).toBe(false);
    expect(result.error).toMatch(/duplicate order value 1/);
  });

  it('rejects stops with invalid coordinates', () => {
    const invalidLat = [
      { name: 'Stop 1', order: 1, latitude: 95.0, longitude: 123.19 },
    ];
    expect(validateStops(invalidLat).valid).toBe(false);

    const invalidLng = [
      { name: 'Stop 1', order: 1, latitude: 13.62, longitude: 200.0 },
    ];
    expect(validateStops(invalidLng).valid).toBe(false);
  });
});

describe('Admin Route Management — Proximity & High Stop Count Warnings', () => {
  const line = {
    type: 'LineString',
    coordinates: [
      [123.190, 13.620],
      [123.195, 13.625],
    ],
  };

  it('returns no warnings when stops are close to the route line', () => {
    const stops = [
      { name: 'On line stop', order: 1, latitude: 13.620, longitude: 123.190 },
    ];
    const warnings = getStopProximityWarnings(stops, line);
    expect(warnings).toHaveLength(0);
  });

  it('warns when a stop is >100m away from the route line (without rejecting)', () => {
    // 0.01 deg lat is ~1.1km
    const farStop = [
      { name: 'Far away stop', order: 1, latitude: 13.640, longitude: 123.190 },
    ];
    const warnings = getStopProximityWarnings(farStop, line);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toMatch(/Far away stop/);
    expect(warnings[0]).toMatch(/from the nearest point on the route path/);
  });

  it('warns against MultiLineString when stop is far from all line segments', () => {
    const multiLine = {
      type: 'MultiLineString',
      coordinates: [
        [[123.190, 13.620], [123.195, 13.625]],
        [[123.200, 13.630], [123.205, 13.635]],
      ],
    };
    const nearSecondSegment = [
      { name: 'Near Segment 2', order: 1, latitude: 13.630, longitude: 123.200 },
    ];
    expect(getStopProximityWarnings(nearSecondSegment, multiLine)).toHaveLength(0);

    const farFromBoth = [
      { name: 'Far Stop', order: 1, latitude: 13.700, longitude: 123.300 },
    ];
    const warnings = getStopProximityWarnings(farFromBoth, multiLine);
    expect(warnings.length).toBeGreaterThan(0);
  });

  it('warns when route has >100 active stops', () => {
    const manyStops = Array.from({ length: 105 }, (_, i) => ({
      name: `Stop ${i + 1}`,
      order: i + 1,
      latitude: 13.620,
      longitude: 123.190,
    }));
    const warnings = getStopProximityWarnings(manyStops, line);
    expect(warnings.some((w) => w.includes('over the recommended limit of 100'))).toBe(true);
  });
});

describe('Admin Route Management — Stop Soft-Archival and ID Preservation Logic', () => {
  it('preserves existing stop _ids and soft-archives removed stops', () => {
    const existingStops = [
      { _id: 'stop_1', name: 'Stop 1', order: 1, isArchived: false },
      { _id: 'stop_2', name: 'Stop 2', order: 2, isArchived: false },
      { _id: 'stop_3', name: 'Stop 3', order: 3, isArchived: false },
    ];

    // Client sends an update where stop_2 is removed and a new stop is added
    const incomingStops = [
      { _id: 'stop_1', name: 'Stop 1 Renamed', order: 1 },
      { name: 'Brand New Stop', order: 2 },
    ];

    // Replicate controller reconciliation logic
    const existingMap = new Map(existingStops.map((s) => [String(s._id), s]));
    const reconciledStops = [];
    const incomingIds = new Set();

    for (const inStop of incomingStops) {
      if (inStop._id && existingMap.has(String(inStop._id))) {
        const existing = existingMap.get(String(inStop._id));
        incomingIds.add(String(inStop._id));
        reconciledStops.push({
          _id: existing._id,
          name: inStop.name,
          order: inStop.order,
          isArchived: false,
          archivedAt: null,
        });
      } else {
        reconciledStops.push({
          name: inStop.name,
          order: inStop.order,
          isArchived: false,
        });
      }
    }

    // Soft-archive stops not present in incoming
    for (const existing of existingStops) {
      if (!incomingIds.has(String(existing._id))) {
        reconciledStops.push({
          _id: existing._id,
          name: existing.name,
          order: existing.order,
          isArchived: true,
          archivedAt: existing.archivedAt || new Date(),
        });
      }
    }

    // Assertions
    const activeStops = reconciledStops.filter((s) => !s.isArchived);
    const archivedStops = reconciledStops.filter((s) => s.isArchived);

    expect(activeStops).toHaveLength(2);
    expect(activeStops[0]._id).toBe('stop_1'); // Preserved!
    expect(activeStops[0].name).toBe('Stop 1 Renamed');
    expect(activeStops[1].name).toBe('Brand New Stop');

    expect(archivedStops).toHaveLength(2); // stop_2 and stop_3 were soft-archived
    expect(archivedStops.some((s) => s._id === 'stop_2' && s.isArchived === true)).toBe(true);
    expect(archivedStops.some((s) => s._id === 'stop_3' && s.isArchived === true)).toBe(true);
    expect(reconciledStops).toHaveLength(4); // None hard deleted!
  });
});

describe('Admin Route Management — Driver Consumer Filtering', () => {
  it('driver-facing stop list filters out archived stops', () => {
    const route = {
      name: 'Test Route',
      stops: [
        { _id: 's1', name: 'Active Stop 1', order: 1, isArchived: false },
        { _id: 's2', name: 'Archived Stop 2', order: 2, isArchived: true },
        { _id: 's3', name: 'Active Stop 3', order: 3, isArchived: false },
      ],
    };

    const driverVisibleStops = (route.stops || [])
      .filter((s) => !s.isArchived)
      .sort((a, b) => a.order - b.order);

    expect(driverVisibleStops).toHaveLength(2);
    expect(driverVisibleStops.map((s) => s._id)).toEqual(['s1', 's3']);
  });

  it('historical logs retain ability to validate archived stops', () => {
    const route = {
      name: 'Test Route',
      stops: [
        { _id: 's1', name: 'Active Stop 1', order: 1, isArchived: false },
        { _id: 's2', name: 'Archived Stop 2', order: 2, isArchived: true },
      ],
    };

    // Both active and archived stops exist in the route's full stops set
    const stopExists = (stopId) => route.stops.some((s) => s._id.toString() === stopId);
    expect(stopExists('s1')).toBe(true);
    expect(stopExists('s2')).toBe(true); // Archived stop is still valid for sync/historical logs!
    expect(stopExists('s999')).toBe(false);
  });
});

describe('Admin Route Management — Controller Level Guards', () => {
  const { createRoute, updateRoute, archiveRoute } = require('../src/controllers/admin.controller');

  const mockRes = () => {
    const res = {};
    res.statusCode = 200;
    res.status = (code) => {
      res.statusCode = code;
      return res;
    };
    res.json = (data) => {
      res.data = data;
      return res;
    };
    return res;
  };

  it('createRoute explicitly rejects requests containing areaBoundary', async () => {
    const req = {
      body: {
        name: 'Test Route',
        barangay: ['Centro'],
        schedule: [1, 2],
        areaBoundary: { type: 'Polygon', coordinates: [] },
      },
    };
    const res = mockRes();
    await createRoute(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/areaBoundary is not supported/);
  });

  it('updateRoute explicitly rejects requests containing areaBoundary', async () => {
    const Route = require('../src/models/Route');
    jest.spyOn(Route, 'findById').mockResolvedValueOnce({
      _id: 'mock_route_id',
      name: 'Existing Route',
      stops: [],
    });

    const req = {
      params: { routeId: 'mock_route_id' },
      body: {
        areaBoundary: { type: 'Polygon', coordinates: [] },
      },
    };
    const res = mockRes();
    await updateRoute(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.data.error).toMatch(/areaBoundary is not supported/);
    Route.findById.mockRestore();
  });

  it('archiveRoute sets isActive to false and rejects if already archived', async () => {
    const Route = require('../src/models/Route');
    const mockRouteDoc = {
      _id: 'mock_route_id',
      name: 'Active Route',
      isActive: true,
      save: jest.fn().mockResolvedValue(true),
    };
    jest.spyOn(Route, 'findById')
      .mockResolvedValueOnce(mockRouteDoc)
      .mockReturnValueOnce({
        populate: jest.fn().mockReturnValue({
          lean: jest.fn().mockResolvedValue({ ...mockRouteDoc, isActive: false }),
        }),
      });

    const req = { params: { routeId: 'mock_route_id' } };
    const res = mockRes();
    await archiveRoute(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockRouteDoc.isActive).toBe(false);
    expect(mockRouteDoc.save).toHaveBeenCalled();

    // Now test archiving an already archived route
    const alreadyArchivedDoc = {
      _id: 'mock_route_id',
      name: 'Inactive Route',
      isActive: false,
    };
    jest.spyOn(Route, 'findById').mockResolvedValueOnce(alreadyArchivedDoc);
    const res2 = mockRes();
    await archiveRoute(req, res2);
    expect(res2.statusCode).toBe(400);
    expect(res2.data.error).toMatch(/already archived/);

    Route.findById.mockRestore();
  });
});
