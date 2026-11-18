// Calendar dates and hours are always Manila-local, regardless of server timezone.
const DAY = 86400000;
const dayKey = value => new Date(new Date(value).getTime() + 8 * 3600000).toISOString().slice(0, 10);
const midnight = day => new Date(`${day}T00:00:00+08:00`);
const shiftDay = (day, offset) => dayKey(new Date(midnight(day).getTime() + offset * DAY));
const percent = (completed, scheduled) => scheduled ? Math.round(completed / scheduled * 1000) / 10 : null;
const latest = values => {
  const times = values.filter(Boolean).map(value => new Date(value).getTime()).filter(Number.isFinite);
  return times.length ? new Date(times.reduce((max, time) => Math.max(max, time), 0)).toISOString() : null;
};

function windowFor(range, now = new Date()) {
  const end = dayKey(now);
  const start = range === 'month' ? `${end.slice(0, 7)}-01` : shiftDay(end, 1 - ({ today: 1, '7d': 7, '14d': 14, '30d': 30 }[range] || 1));
  const days = [];
  for (let day = start; day <= end; day = shiftDay(day, 1)) days.push(day);
  return { start, end, days, from: midnight(start), until: midnight(shiftDay(end, 1)) };
}

// A route/day is an itinerary, not a driver/day: replacement drivers must not
// double the denominator. Frozen trip stops take precedence over the live route.
function buildOccurrences({ routes, sessions, logs, days, today, area = '' }) {
  const byRoute = new Map(routes.map(route => [String(route._id), route]));
  const itineraries = new Map();
  const unknown = new Set();
  const ensure = (routeId, date, name, barangay = []) => {
    const key = `${routeId}:${date}`;
    if (!itineraries.has(key)) itineraries.set(key, { routeId, date, name, barangay, stops: new Map(), closed: date < today, synced: [], snapshot: false });
    return itineraries.get(key);
  };
  for (const session of sessions) {
    const date = dayKey(session.startedAt);
    if (!days.includes(date)) continue;
    const id = String(session.routeId);
    const snapshot = session.routeSnapshot;
    const route = byRoute.get(id);
    const unchanged = route && (!route.updatedAt || new Date(route.updatedAt) <= new Date(session.startedAt));
    const source = Array.isArray(snapshot?.stops) ? snapshot : unchanged ? route : null;
    const row = ensure(id, date, snapshot?.name || session.routeName || 'Unnamed recorded route', snapshot?.barangay || source?.barangay || []);
    row.closed ||= Boolean(session.routeCompletedAt);
    row.synced.push(session.lastSyncedAt, session.createdAt, session.updatedAt);
    if (source) {
      row.snapshot = true;
      for (const stop of source.stops || []) if (!stop.isArchived) row.stops.set(String(stop._id), { ...stop, completed: false });
    } else unknown.add(`${id}:${date}`);
  }
  for (const route of routes) {
    if (!route.isActive || !route.collectorId) continue;
    for (const date of days) {
      const id = String(route._id);
      const key = `${id}:${date}`;
      if (itineraries.get(key)?.snapshot) continue;
      if (itineraries.has(key) && unknown.has(key)) continue;
      if (route.createdAt && dayKey(route.createdAt) > date) continue;
      // The database has no schedule revision history. Never extrapolate a
      // changed assignment backwards or mark its new stops historically missed.
      if (date < today && route.updatedAt && new Date(route.updatedAt) >= midnight(shiftDay(date, 1))) {
        if (!area || route.barangay?.includes(area)) {
          unknown.add(key);
          ensure(id, date, 'Historical route itinerary unavailable');
        }
        continue;
      }
      const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
      if (!route.schedule?.includes(weekday)) continue;
      const row = ensure(id, date, route.name, route.barangay);
      for (const stop of route.stops || []) if (!stop.isArchived) row.stops.set(String(stop._id), { ...stop, completed: false });
    }
  }
  // Mongo already groups repeated syncs; using a map also makes merging safe.
  const uniqueLogs = new Map();
  for (const log of logs) {
    const date = log.date || dayKey(log.collectedAt);
    if (!days.includes(date)) continue;
    const id = String(log.routeId);
    const key = `${id}:${date}`;
    let row = itineraries.get(key);
    if (!row) {
      const route = byRoute.get(id);
      const unchanged = route && (!route.updatedAt || new Date(route.updatedAt) < midnight(shiftDay(date, 1)));
      row = ensure(id, date, unchanged ? route.name : 'Historical route name unavailable', unchanged ? route.barangay : []);
    }
    row.synced.push(log.receivedAt || log.createdAt);
    const stopId = String(log.stopId);
    if (!row.stops.has(stopId)) {
      // Preserve the real completion even when its original itinerary is lost;
      // its denominator is unknown, not a fabricated 100% completion rate.
      unknown.add(key);
    } else row.stops.get(stopId).completed = true;
    const logKey = `${key}:${stopId}`;
    const previous = uniqueLogs.get(logKey);
    if (!previous || new Date(log.completedAt || log.collectedAt) < new Date(previous.completedAt || previous.collectedAt)) uniqueLogs.set(logKey, { ...log, date, routeId: id });
  }
  const rows = [...itineraries.values()].filter(row => !area || row.barangay.includes(area));
  for (const row of rows) row.incomplete = unknown.has(`${row.routeId}:${row.date}`);
  const keys = new Set(rows.map(row => `${row.routeId}:${row.date}`));
  return {
    rows, logs: [...uniqueLogs.values()].filter(log => keys.has(`${log.routeId}:${log.date}`)),
    incomplete: [...unknown].some(key => keys.has(key)) || [...unknown].some(key => !itineraries.has(key)),
    unknownDates: [...new Set([...unknown].filter(key => keys.has(key) || !itineraries.has(key)).map(key => key.slice(-10)))],
    lastSyncedAt: latest(rows.flatMap(row => row.synced)),
  };
}

function summarize(rows, incomplete = rows.some(row => row.incomplete)) {
  const scheduled = rows.reduce((sum, row) => sum + row.stops.size, 0);
  const completed = rows.reduce((sum, row) => sum + [...row.stops.values()].filter(stop => stop.completed).length, 0);
  return { scheduled, completed, remaining: scheduled - completed, rate: incomplete ? null : percent(completed, scheduled) };
}

function coverage(data) {
  const grouped = new Map();
  for (const row of data.rows) {
    // Preserve original names across renamed route snapshots.
    const key = `${row.routeId}:${row.name}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(row);
  }
  const totals = summarize(data.rows, data.incomplete);
  const routes = [...grouped].map(([key, rows]) => {
    const summary = summarize(rows);
    const dates = new Set(rows.map(row => row.date));
    const completed = data.logs.filter(log => log.routeId === rows[0].routeId && dates.has(log.date)).length;
    return { key, name: rows[0].name, ...summary, matchedCompleted: summary.completed, completed };
  }).sort((a, b) => (a.rate ?? 101) - (b.rate ?? 101) || a.name.localeCompare(b.name));
  return { ...totals, completed: data.logs.length, unmatchedCompletions: data.logs.length - totals.completed, routes };
}

function frequent(data) {
  const missed = new Map();
  for (const row of data.rows) if (row.closed) for (const [id, stop] of row.stops) if (!stop.completed) {
    const key = `${row.routeId}:${id}:${row.name}:${stop.name}`;
    if (!missed.has(key)) missed.set(key, { key, name: stop.name, route: row.name, missed: 0 });
    missed.get(key).missed++;
  }
  return [...missed.values()].sort((a, b) => b.missed - a.missed || a.name.localeCompare(b.name)).slice(0, 5);
}

module.exports = { dayKey, midnight, shiftDay, windowFor, latest, percent, buildOccurrences, summarize, coverage, frequent };
