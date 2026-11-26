const valid = point => Array.isArray(point) && typeof point[0] === 'number' && typeof point[1] === 'number' && Number.isFinite(point[0]) && Number.isFinite(point[1]) && Math.abs(point[0]) <= 180 && Math.abs(point[1]) <= 90;
function split(points = []) {
  if (!Array.isArray(points)) return [];
  const lines = []; let line = [];
  points.forEach(point => { if (valid(point)) line.push(point); else if (line.length) { lines.push(line); line = []; } });
  if (line.length) lines.push(line);
  return lines;
}
function geometryLines(geometry) {
  return geometry?.type === 'LineString' ? split(geometry.coordinates) : geometry?.type === 'MultiLineString' ? (geometry.coordinates || []).flatMap(split) : [];
}
export function historyTrailLines(data = {}) {
  const groups = new Map();
  const uploaded = Array.isArray(data.trailPoints) ? [...data.trailPoints] : null;
  uploaded?.sort((a,b) => new Date(a.recordedAt)-new Date(b.recordedAt)).forEach(point => {
    const key = point.clientSessionId || 'legacy';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(point);
  });
  const raw = [...groups.values()].flatMap(points => split(points.sort((a,b) => new Date(a.recordedAt)-new Date(b.recordedAt)).map(p => [p.longitude, p.latitude])));
  // The detail endpoint's raw points are authoritative, including an empty upload.
  // Report/PDF geometry is only a compatibility fallback when raw points are absent.
  const recorded = uploaded !== null ? raw : data.trail?.coveredSegments?.flatMap(split) || (data.trailPath ? geometryLines(data.trailPath) : split(data.trail?.coveredCoordinates));
  const expected = data.trail?.expectedSegments?.flatMap(split) || geometryLines(data.route?.routePath || data.routePath);
  return { recorded, expected: expected.length ? expected : split(data.trail?.expectedCoordinates) };
}
// Marker order is global GPS time, not the order of grouped drawable segments.
export function historyTrailEndpoints(data = {}) {
  const uploaded = Array.isArray(data.trailPoints) ? data.trailPoints.filter(p => valid([p.longitude, p.latitude]))
    .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)) : null;
  const fallback = uploaded === null ? historyTrailLines(data).recorded.flat() : [];
  const first = uploaded?.[0], last = uploaded?.at(-1);
  const start = uploaded !== null ? (first ? [first.longitude, first.latitude] : null)
    : data.trail?.startCoord ?? data.trail?.entryCoord ?? fallback[0] ?? null;
  const end = uploaded !== null ? (last ? [last.longitude, last.latitude] : null)
    : data.trail?.endCoord ?? data.trail?.exitCoord ?? fallback.at(-1) ?? null;
  const ended = data.sessions?.length ? data.sessions.every(session => Boolean(session.endedAt))
    : Boolean(data.session?.endedAt || data.sessionEndedAt);
  const endLabel = ended ? 'End' : 'Last GPS';
  const markers = valid(start) && valid(end) && start.every((value, index) => value === end[index])
    ? [{ point: start, label: 'Start / ' + endLabel }]
    : [...(valid(start) ? [{ point: start, label: 'Start' }] : []), ...(valid(end) ? [{ point: end, label: endLabel }] : [])];
  return { start, end, markers, ended,
    firstRecordedAt: uploaded !== null ? first?.recordedAt : data.trail?.firstRecordedAt,
    lastRecordedAt: uploaded !== null ? last?.recordedAt : data.trail?.lastRecordedAt };
}

export function projectTrailPoint(points, width = 620, height = 280) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(([x,y]) => { minX = Math.min(minX,x); maxX = Math.max(maxX,x); minY = Math.min(minY,y); maxY = Math.max(maxY,y); });
  const latitudeScale = Math.cos((minY + maxY) / 2 * Math.PI / 180);
  const spanX = Math.max((maxX-minX) * latitudeScale, .00001), spanY = Math.max(maxY-minY, .00001);
  const scale = Math.min((width-60)/spanX, (height-60)/spanY);
  const centerX = (minX+maxX)/2, centerY = (minY+maxY)/2;
  return point => [width/2 + (point[0]-centerX) * latitudeScale * scale, height/2 - (point[1]-centerY) * scale];
}

export function trailFeatureCollection(lines) {
  return { type: 'FeatureCollection', features: lines.filter(line => line.length).map(coordinates => ({
    type: 'Feature', properties: {}, geometry: coordinates.length > 1
      ? { type: 'LineString', coordinates }
      : { type: 'Point', coordinates: coordinates[0] },
  })) };
}
export function trailBounds(recorded, expected, focusTravel) {
  const points = focusTravel && recorded.some(line => line.length) ? recorded.flat() : [...recorded.flat(), ...expected.flat()];
  if (!points.length) return null;
  return points.reduce((bounds,[longitude,latitude]) => [
    [Math.min(bounds[0][0],longitude),Math.min(bounds[0][1],latitude)],
    [Math.max(bounds[1][0],longitude),Math.max(bounds[1][1],latitude)],
  ], [[Infinity,Infinity],[-Infinity,-Infinity]]);
}
