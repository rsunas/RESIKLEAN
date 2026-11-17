const Session = require('../models/RouteTrailSession');
const Point = require('../models/RouteTrailPoint');

// History groups use the trip's start date in Manila, including overnight trips.
async function getRouteHistoryTrail(collectorId, routeId, eventDate) {
  const start = new Date(`${eventDate}T00:00:00+08:00`);
  const end = new Date(start.getTime() + 86400000);
  const sessions = await Session.find({ collectorId, routeId, startedAt: { $gte: start, $lt: end } }).sort({ startedAt: 1 }).lean();
  const trailPoints = sessions.length ? await Point.find({ collectorId, routeId, clientSessionId: { $in: sessions.map(s => s.clientSessionId) } }).sort({ recordedAt: 1 }).lean() : [];
  const ended = sessions.map(s => s.endedAt).filter(Boolean).sort((a,b) => new Date(a)-new Date(b));
  const session = sessions.length ? { ...sessions[0], endedAt: ended.at(-1) || null, status: sessions.every(s => s.status === 'completed') ? 'completed' : 'active' } : null;
  return { sessions, session, trailPoints };
}

const validPosition = c => Array.isArray(c) && typeof c[0] === 'number' && typeof c[1] === 'number' && Number.isFinite(c[0]) && Number.isFinite(c[1]) && Math.abs(c[0]) <= 180 && Math.abs(c[1]) <= 90;
function splitValidPositions(coordinates = []) {
  const lines = []; let line = [];
  coordinates.forEach(c => { if (validPosition(c)) line.push(c); else if (line.length) { lines.push(line); line = []; } });
  if (line.length) lines.push(line);
  return lines;
}
function trailSegments(points = []) {
  const groups = new Map();
  [...points].sort((a,b) => new Date(a.recordedAt)-new Date(b.recordedAt)).forEach(p => {
    const key = p.clientSessionId || 'legacy';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push([p.longitude, p.latitude]);
  });
  return [...groups.values()].flatMap(splitValidPositions);
}
function routeSegments(geometry) {
  if (geometry?.type === 'LineString') return splitValidPositions(geometry.coordinates);
  if (geometry?.type === 'MultiLineString') return (geometry.coordinates || []).flatMap(splitValidPositions);
  return [];
}
module.exports = { getRouteHistoryTrail, trailSegments, routeSegments };
