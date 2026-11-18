const Route = require('../models/Route');
const RouteLog = require('../models/RouteLog');
const RouteTrailSession = require('../models/RouteTrailSession');
const MissedReport = require('../models/MissedReport');
const { sendSuccess, sendError } = require('../utils/response');
const metrics = require('../services/overviewMetrics');

const note = 'Some historical route data is unavailable.';

async function loadStops(window, area, today) {
  const [routes, sessions, logs] = await Promise.all([
    Route.find({}).select('name barangay schedule stops._id stops.name stops.isArchived collectorId isActive createdAt updatedAt').lean(),
    RouteTrailSession.find({ startedAt: { $gte: window.from, $lt: window.until } })
      .select('routeId routeName routeSnapshot.name routeSnapshot.barangay routeSnapshot.stops startedAt routeCompletedAt lastSyncedAt createdAt updatedAt').sort({ startedAt: 1 }).lean(),
    RouteLog.aggregate([
      { $match: { status: 'collected', collectedAt: { $gte: window.from, $lt: window.until } } },
      { $group: {
        _id: { routeId: '$routeId', stopId: '$stopId', date: { $dateToString: { date: '$collectedAt', format: '%Y-%m-%d', timezone: 'Asia/Manila' } } },
        completedAt: { $min: { $ifNull: ['$exitedAt', '$collectedAt'] } }, receivedAt: { $max: '$createdAt' },
      } },
      { $project: { _id: 0, routeId: '$_id.routeId', stopId: '$_id.stopId', date: '$_id.date', completedAt: 1, receivedAt: 1 } },
    ]),
  ]);
  const data = metrics.buildOccurrences({ routes, sessions, logs, days: window.days, today, area });
  data.areas = [...new Set([...routes.flatMap(route => route.barangay || []), ...sessions.flatMap(session => session.routeSnapshot?.barangay || [])])].sort();
  return data;
}

function endpoint(kind) {
  return async (req, res) => {
    const allowed = kind === 'daily' ? ['7d', '14d'] : kind === 'complaints' ? ['all', 'today', '7d', 'month'] : ['today', '7d', 'month'];
    const range = req.query.range || (kind === 'daily' ? '7d' : kind === 'complaints' ? 'all' : 'today');
    const area = req.query.area || '';
    if (!allowed.includes(range) || typeof area !== 'string' || area.length > 200) return sendError(res, 'Invalid range or area', 400);
    try {
      const now = new Date();
      const today = metrics.dayKey(now);
      const window = range === 'all' ? null : metrics.windowFor(kind === 'frequent' ? '30d' : range, now);
      const base = window ? { start: window.start, end: window.end, timezone: 'Asia/Manila' } : { start: null, end: null, timezone: 'Asia/Manila' };
      if (kind === 'complaints') {
        const match = { ...(window ? { createdAt: { $gte: window.from, $lt: window.until } } : {}), ...(area ? { barangay: area } : {}) };
        const groups = await MissedReport.aggregate([
          { $match: match },
          { $group: { _id: '$status', count: { $sum: 1 }, receivedAt: { $max: '$updatedAt' } } },
        ]);
        const statuses = ['pending', 'verified', 'resolved', 'rejected'].map(status => ({ status, count: groups.filter(group => group._id === status || (status === 'verified' && group._id === 'scheduled')).reduce((sum, group) => sum + group.count, 0) }));
        const total = statuses.reduce((sum, status) => sum + status.count, 0);
        return sendSuccess(res, { ...base, range, total, statuses: statuses.map(status => ({ ...status, percent: metrics.percent(status.count, total) || 0 })), lastSyncedAt: metrics.latest(groups.map(group => group.receivedAt)) });
      }
      let fetchWindow = window;
      if (kind === 'daily') {
        const start = metrics.shiftDay(window.start, -window.days.length);
        const previous = Array.from({ length: window.days.length }, (_, i) => metrics.shiftDay(start, i));
        fetchWindow = { ...window, start, from: metrics.midnight(start), days: [...previous, ...window.days] };
      }
      const data = await loadStops(fetchWindow, kind === 'frequent' ? '' : area, today);
      let result;
      if (kind === 'coverage') result = { ...metrics.coverage(data), areas: data.areas };
      if (kind === 'hourly') {
        const counts = new Map();
        for (const log of data.logs) {
          const hour = new Date(new Date(log.completedAt).getTime() + 8 * 3600000).getUTCHours();
          counts.set(hour, (counts.get(hour) || 0) + 1);
        }
        const hours = [...counts].sort(([a], [b]) => a - b).map(([hour, count]) => ({ hour, count }));
        const peak = hours.reduce((best, hour) => !best || hour.count > best.count ? hour : best, null);
        result = { hours, total: data.logs.length, peakHour: peak?.hour ?? null };
      }
      if (kind === 'frequent') result = { stops: metrics.frequent(data) };
      if (kind === 'daily') {
        const days = fetchWindow.days.map(date => ({ date, ...metrics.summarize(data.rows.filter(row => row.date === date), data.unknownDates.includes(date)), completed: data.logs.filter(log => log.date === date).length }));
        const current = days.filter(day => day.date >= window.start);
        const previous = days.filter(day => day.date < window.start);
        const average = list => { const available = list.filter(day => day.rate !== null); return available.length ? Math.round(available.reduce((sum, day) => sum + day.rate, 0) / available.length * 10) / 10 : null; };
        const avg = data.incomplete ? null : average(current);
        const prev = data.incomplete ? null : average(previous);
        result = { days: current, average: avg, best: data.incomplete ? null : Math.max(...current.map(day => day.rate ?? 0)), todayRate: current.at(-1)?.rate ?? null, delta: avg !== null && prev !== null ? Math.round((avg - prev) * 10) / 10 : null };
      }
      return sendSuccess(res, { ...base, ...result, lastSyncedAt: data.lastSyncedAt, incomplete: data.incomplete, note: data.incomplete ? note : null });
    } catch (error) {
      console.error(`Overview ${kind}:`, error.message);
      return sendError(res, 'Unable to load collection metrics. Please try again.', 500);
    }
  };
}
module.exports = { coverage: endpoint('coverage'), daily: endpoint('daily'), complaints: endpoint('complaints'), hourly: endpoint('hourly'), frequent: endpoint('frequent') };
