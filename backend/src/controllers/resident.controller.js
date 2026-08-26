const MissedReport = require('../models/MissedReport');
const Route        = require('../models/Route');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/resident/schedule ────────────────────────────────────────────────
// Returns the full collection schedule for the resident's barangay:
//   • All active routes (with waste type and weekly day pattern)
//   • Next collection date for each route
//   • Upcoming collections list (next 14 days)
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper: find the next occurrence of a given day-of-week from a starting date
function getNextDateForDay(dayOfWeek, fromDate) {
  const diff = (dayOfWeek - fromDate.getDay() + 7) % 7;
  const next = new Date(fromDate);
  next.setDate(next.getDate() + (diff === 0 ? 0 : diff));
  next.setHours(6, 0, 0, 0); // default collection time 6:00 AM
  return next;
}

const getSchedule = async (req, res) => {
  try {
    const { barangay } = req.user;
    if (!barangay) return sendError(res, 'Your profile has no barangay set', 400);

    const routes = await Route.find({ barangay, isActive: true })
      .select('name barangay schedule')
      .lean();

    const now = new Date();
    const today = now.getDay();

    // 0=Sun, 4=Thurs are Non-Biodegradable. Everything else is Biodegradable.
    const getWasteTypeForDay = (day) => {
      return (day === 0 || day === 4) ? 'non-biodegradable' : 'biodegradable';
    };

    // Build schedule info for each route
    const routeSchedules = routes.map((route) => {
      // Human-readable weekly pattern (e.g. "Monday, Wednesday, Friday")
      const weeklyPattern = (route.schedule || [])
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d]);

      // Find the nearest upcoming collection day
      let nextCollection = null;
      let nextWasteType = 'biodegradable';
      if (route.schedule && route.schedule.length > 0) {
        const upcoming = route.schedule
          .map((day) => ({ date: getNextDateForDay(day, now), day }))
          .filter((item) => item.date >= now)
          .sort((a, b) => a.date - b.date);

        // If no dates remain this week, wrap to next week
        if (upcoming.length > 0) {
          nextCollection = upcoming[0].date;
          nextWasteType = getWasteTypeForDay(upcoming[0].day);
        } else {
          const nextWeek = new Date(now);
          nextWeek.setDate(nextWeek.getDate() + 1);
          const nextDay = route.schedule.sort((a, b) => a - b)[0];
          nextCollection = getNextDateForDay(nextDay, nextWeek);
          nextWasteType = getWasteTypeForDay(nextDay);
        }
      }

      return {
        routeId: route._id,
        name: route.name,
        barangay: route.barangay,
        weeklyPattern,
        nextCollection,
        nextWasteType,
        isToday: route.schedule?.includes(today) || false,
        todayWasteType: route.schedule?.includes(today) ? getWasteTypeForDay(today) : null,
      };
    });

    // Sort by next collection date (soonest first)
    routeSchedules.sort((a, b) => {
      if (!a.nextCollection) return 1;
      if (!b.nextCollection) return -1;
      return a.nextCollection - b.nextCollection;
    });

    // Build upcoming collections list for the next 14 days
    const upcomingCollections = [];
    for (let i = 0; i < 14; i++) {
      const date = new Date(now);
      date.setDate(date.getDate() + i);
      date.setHours(6, 0, 0, 0);
      const dayOfWeek = date.getDay();

      const matchingRoutes = routes.filter((r) => r.schedule?.includes(dayOfWeek));
      if (matchingRoutes.length > 0) {
        upcomingCollections.push({
          date,
          dayName: DAY_NAMES[dayOfWeek],
          wasteType: getWasteTypeForDay(dayOfWeek), // The rule applies to the whole day
          collections: matchingRoutes.map((r) => ({
            routeId: r._id,
            name: r.name,
          })),
        });
      }
    }

    sendSuccess(res, {
      barangay,
      today: DAY_NAMES[today],
      routes: routeSchedules,
      upcomingCollections,
    });
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── POST /api/resident/reports ────────────────────────────────────────────────
// Resident submits a missed collection report with an optional photo.
// If a photo is attached (via multer), it is uploaded to Cloudinary.
const submitReport = async (req, res) => {
  try {
    const { description } = req.body;
    const { _id: residentId, barangay } = req.user;

    if (!barangay) return sendError(res, 'Your profile has no barangay set', 400);

    // Upload photo to Cloudinary if one was attached
    let photoUrl = null;
    if (req.file) {
      const result = await uploadPhoto(req.file.buffer);
      photoUrl = result.url;
    }

    const report = await MissedReport.create({
      residentId,
      barangay,
      description: description || '',
      photoUrl,
      // aiVerified & aiConfidence will be updated by the Roboflow sprint
    });

    sendSuccess(res, report, 201);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

// ── GET /api/resident/reports ─────────────────────────────────────────────────
// Returns the logged-in resident's own reports, newest first.
// Supports optional ?status= filter (pending | verified | rejected | resolved).
const getMyReports = async (req, res) => {
  try {
    const { status } = req.query;
    const filter = { residentId: req.user._id };
    if (status) filter.status = status;

    const reports = await MissedReport.find(filter)
      .sort({ createdAt: -1 })
      .lean();

    sendSuccess(res, reports);
  } catch (err) {
    sendError(res, err.message, 500);
  }
};

module.exports = { getSchedule, submitReport, getMyReports };
