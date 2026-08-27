const MissedReport = require('../models/MissedReport');
const Route        = require('../models/Route');
const CollectionLocation = require('../models/CollectionLocation');
const { uploadPhoto } = require('../services/cloudinary.service');
const { sendSuccess, sendError } = require('../utils/response');

// ── GET /api/resident/schedule ────────────────────────────────────────────────
// Returns the full collection schedule for the resident's location/barangay.
// First tries CollectionLocation lookup (canonical SWMO data), then falls back
// to the legacy Route-based approach for backward compatibility.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Helper: find the next occurrence of a given day-of-week from a starting date
function getNextDateForDay(dayOfWeek, fromDate) {
  const diff = (dayOfWeek - fromDate.getDay() + 7) % 7;
  const next = new Date(fromDate);
  next.setDate(next.getDate() + (diff === 0 ? 0 : diff));
  next.setHours(6, 0, 0, 0); // default collection time 6:00 AM
  return next;
}

// Map day names to numbers for date calculations
const DAY_TO_NUM = { Sunday: 0, Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4, Friday: 5, Saturday: 6 };

const getSchedule = async (req, res) => {
  try {
    const { location, barangay } = req.user;
    const locationName = location || barangay;
    if (!locationName) return sendError(res, 'Your profile has no location set', 400);

    // ── 1. Try CollectionLocation lookup ──────────────────────────────────
    const collectionLocation = await CollectionLocation.findOne({ name: locationName }).lean();

    if (collectionLocation) {
      const now = new Date();
      const today = DAY_NAMES[now.getDay()];

      // Determine today's waste type
      let todayWasteType = null;
      for (const sched of collectionLocation.schedules) {
        if (sched.days.includes(today)) {
          todayWasteType = sched.wasteType;
          break;
        }
      }

      // Calculate next collection date
      let nextCollection = null;
      let nextWasteType = null;
      const allScheduledDays = collectionLocation.schedules.flatMap((s) =>
        s.days.map((d) => ({ day: d, wasteType: s.wasteType }))
      );

      // Sort by distance from today
      const upcoming = allScheduledDays
        .map((item) => ({
          ...item,
          date: getNextDateForDay(DAY_TO_NUM[item.day], now),
        }))
        .filter((item) => item.date >= now)
        .sort((a, b) => a.date - b.date);

      if (upcoming.length > 0) {
        nextCollection = upcoming[0].date;
        nextWasteType = upcoming[0].wasteType;
      }

      // Build upcoming collections list for the next 14 days
      const upcomingCollections = [];
      for (let i = 0; i < 14; i++) {
        const date = new Date(now);
        date.setDate(date.getDate() + i);
        date.setHours(6, 0, 0, 0);
        const dayName = DAY_NAMES[date.getDay()];

        for (const sched of collectionLocation.schedules) {
          if (sched.days.includes(dayName)) {
            upcomingCollections.push({
              date,
              dayName,
              wasteType: sched.wasteType,
              timeWindows: sched.timeWindows,
            });
          }
        }
      }

      return sendSuccess(res, {
        location: collectionLocation.name,
        area: collectionLocation.area,
        shift: collectionLocation.shift,
        today,
        todayWasteType,
        nextCollection,
        nextWasteType,
        schedules: collectionLocation.schedules,
        upcomingCollections,
      });
    }

    // ── 2. Fallback: legacy Route-based lookup ────────────────────────────
    // This handles existing users whose barangay matches Route.barangay
    const routes = await Route.find({ barangay: locationName, isActive: true })
      .select('name barangay schedule')
      .lean();

    const now = new Date();
    const todayNum = now.getDay();

    const getWasteTypeForDay = (day) => {
      return (day === 0 || day === 4) ? 'non-biodegradable' : 'biodegradable';
    };

    const routeSchedules = routes.map((route) => {
      const weeklyPattern = (route.schedule || [])
        .sort((a, b) => a - b)
        .map((d) => DAY_NAMES[d]);

      let nextCollectionDate = null;
      let nextWasteType = 'biodegradable';
      if (route.schedule && route.schedule.length > 0) {
        const upcoming = route.schedule
          .map((day) => ({ date: getNextDateForDay(day, now), day }))
          .filter((item) => item.date >= now)
          .sort((a, b) => a.date - b.date);

        if (upcoming.length > 0) {
          nextCollectionDate = upcoming[0].date;
          nextWasteType = getWasteTypeForDay(upcoming[0].day);
        } else {
          const nextWeek = new Date(now);
          nextWeek.setDate(nextWeek.getDate() + 1);
          const nextDay = route.schedule.sort((a, b) => a - b)[0];
          nextCollectionDate = getNextDateForDay(nextDay, nextWeek);
          nextWasteType = getWasteTypeForDay(nextDay);
        }
      }

      return {
        routeId: route._id,
        name: route.name,
        barangay: route.barangay,
        weeklyPattern,
        nextCollection: nextCollectionDate,
        nextWasteType,
        isToday: route.schedule?.includes(todayNum) || false,
        todayWasteType: route.schedule?.includes(todayNum) ? getWasteTypeForDay(todayNum) : null,
      };
    });

    routeSchedules.sort((a, b) => {
      if (!a.nextCollection) return 1;
      if (!b.nextCollection) return -1;
      return a.nextCollection - b.nextCollection;
    });

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
          wasteType: getWasteTypeForDay(dayOfWeek),
          collections: matchingRoutes.map((r) => ({
            routeId: r._id,
            name: r.name,
          })),
        });
      }
    }

    sendSuccess(res, {
      barangay: locationName,
      today: DAY_NAMES[todayNum],
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
