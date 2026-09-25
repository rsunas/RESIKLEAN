const mongoose = require('mongoose');

// A single stop/waypoint on a collection route
const stopSchema = new mongoose.Schema({
  name: { type: String, required: true },
  latitude: { type: Number, required: false }, // Optional, as some stops only have names/times right now
  longitude: { type: Number, required: false }, // Optional
  order: { type: Number, required: true },   // sequence in the route
  expectedTime: { type: String, required: false }, // e.g., "4:25 AM"
});

const routeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Barangay(s) this route covers — array because one route can span multiple barangays
    barangay: [{ type: String, trim: true }],
    // Days of week this route runs: 0=Sun, 1=Mon, …, 6=Sat
    schedule: [{ type: Number, min: 0, max: 6 }],
    stops: [stopSchema],
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive: { type: Boolean, default: true },
    // GeoJSON LineString / MultiLineString storing the collection route path.
    // Populated from traced .kml → GeoJSON conversion (Google Earth Pro paths).
    // Mobile map renders this as the truck's driving route on the Driver's map.
    routePath: {
      type: { type: String, enum: ['LineString', 'MultiLineString'] },
      coordinates: { type: mongoose.Schema.Types.Mixed },  // LineString: [[lng,lat], …]  MultiLineString: [[[lng,lat], …], …]
    },
  },
  { timestamps: true }
);

// Geospatial index for route path queries (e.g. near-line lookups)
routeSchema.index({ routePath: '2dsphere' });

module.exports = mongoose.model('Route', routeSchema);
