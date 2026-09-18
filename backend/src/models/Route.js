const mongoose = require('mongoose');

// A single stop/waypoint on a collection route
const stopSchema = new mongoose.Schema({
  name:      { type: String, required: true },
  latitude:  { type: Number, required: true },
  longitude: { type: Number, required: true },
  order:     { type: Number, required: true },   // sequence in the route
});

const routeSchema = new mongoose.Schema(
  {
    name:        { type: String, required: true, trim: true },
    barangay:    { type: String, required: true },
    // Days of week this route runs: 0=Sun, 1=Mon, …, 6=Sat
    schedule:    [{ type: Number, min: 0, max: 6 }],
    stops:       [stopSchema],
    collectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    isActive:    { type: Boolean, default: true },
    // GeoJSON Polygon storing the collection area boundary.
    // Populated from traced .kml → GeoJSON conversion (Google Earth Pro).
    // Mobile map renders this as a highlighted region on the Driver's route map.
    areaBoundary: {
      type:        { type: String, enum: ['Polygon'] },
      coordinates: { type: [[[Number]]] },  // [ring][point][lng, lat]
    },
  },
  { timestamps: true }
);

// Geospatial index for area boundary queries (e.g. point-in-polygon lookups)
routeSchema.index({ areaBoundary: '2dsphere' });

module.exports = mongoose.model('Route', routeSchema);
