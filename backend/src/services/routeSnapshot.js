const { validateRoutePath } = require('../utils/routeValidation');

// Whitelist display data. A snapshot never changes assignment or stop-log status.
function makeRouteSnapshot(value) {
  if (!value || typeof value.name !== 'string' || !value.name.trim()) return null;
  const snapshot = { name: value.name.trim().slice(0, 200) };
  if (value.routePath && validateRoutePath(value.routePath).valid) snapshot.routePath = value.routePath;
  if (Array.isArray(value.barangay)) snapshot.barangay = value.barangay.filter(v => typeof v === 'string').map(v => v.slice(0, 200));
  if (Array.isArray(value.stops)) snapshot.stops = value.stops.filter(s => !s.isArchived).map(s => ({
    _id: s._id, name: String(s.name || '').slice(0, 200), order: s.order,
    latitude: s.latitude, longitude: s.longitude,
  }));
  return snapshot;
}

function historicalRoute(route, session) {
  if (session?.routeSnapshot) return { _id: session.routeId || route?._id, ...session.routeSnapshot };
  // Legacy sessions retained their original name even before full snapshots.
  // A changed live route must not be presented as the old assigned geometry.
  const changed = session && ((session.routeName && route?.name !== session.routeName)
    || (route?.updatedAt && new Date(route.updatedAt) > new Date(session.startedAt)));
  if (changed) return { _id: session.routeId || route?._id, name: session.routeName || 'Recorded route', routePath: null, stops: [], barangay: [] };
  return route || (session ? { _id: session.routeId, name: session.routeName, routePath: null, stops: [], barangay: [] } : null);
}

module.exports = { makeRouteSnapshot, historicalRoute };
