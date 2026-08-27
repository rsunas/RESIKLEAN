const CollectionLocation = require('../models/CollectionLocation');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/collection-locations ─────────────────────────────────────────────
// Public endpoint — no auth required.
// Returns all canonical collection locations, with optional filters:
//   ?type=barangay       → filter by type
//   ?search=san          → case-insensitive name search
//   ?area=Area 10        → filter by staff area
const getLocations = async (req, res) => {
  try {
    const { type, search, area } = req.query;
    const filter = {};

    if (type)   filter.type = type;
    if (area)   filter.area = area;
    if (search) filter.name = { $regex: search, $options: 'i' };

    const locations = await CollectionLocation.find(filter)
      .sort({ name: 1 })
      .lean();

    sendSuccess(res, locations);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { getLocations };
