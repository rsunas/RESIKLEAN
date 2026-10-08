const mongoose = require('mongoose');
const TruckLoad = require('../models/TruckLoad');
const ComplianceReport = require('../models/ComplianceReport');

/**
 * Helper to get the start and end of day in Asia/Manila timezone
 */
function getManilaDateBounds(startStr, endStr) {
  // startStr and endStr are YYYY-MM-DD
  const start = new Date(`${startStr}T00:00:00+08:00`);
  const end = new Date(`${endStr}T23:59:59.999+08:00`);
  return { start, end };
}

/**
 * Get Manila YYYY-MM-DD from a Date object
 */
function getManilaYYYYMMDD(dateObj) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(dateObj);
}

/**
 * Format Manila Date and Time
 */
function formatManilaDateTime(dateObj) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: true,
  }).format(dateObj);
}

function generateDateList(startStr, endStr) {
  const dates = [];
  let current = new Date(`${startStr}T12:00:00+08:00`); // Use noon to avoid daylight saving issues
  const end = new Date(`${endStr}T12:00:00+08:00`);
  while (current <= end) {
    dates.push(getManilaYYYYMMDD(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

async function getTonnageTrendData(startStr, endStr) {
  const { start, end } = getManilaDateBounds(startStr, endStr);
  const dateList = generateDateList(startStr, endStr);

  const loads = await TruckLoad.find({
    arrivedAt: { $gte: start, $lte: end },
  })
    .populate({ path: 'staffId', select: 'name location assignedRouteId', populate: { path: 'assignedRouteId', select: 'name barangay' } })
    .populate('routeId', 'name barangay')
    .sort({ arrivedAt: 1 })
    .lean();

  const dailyMap = {};
  dateList.forEach((d) => {
    dailyMap[d] = { date: d, truckLoads: 0, totalTonnage: 0, avgPerLoad: 0 };
  });

  const areaMap = {};
  const staffMap = {};
  const loadLogs = [];

  let totalTonnageAll = 0;
  let totalLoadsAll = 0;

  loads.forEach((load) => {
    // Sanity check
    const calculated = (load.length * load.width * load.height + (load.slope || 0)) * (load.densityFactor || 0.294);
    if (Math.abs(load.tonnesEstimate - calculated) > 0.01) {
      console.warn(`Sanity check failed for log ${load._id}: stored ${load.tonnesEstimate}, calculated ${calculated}`);
    }

    const tonnage = load.tonnesEstimate || 0;
    const dateStr = getManilaYYYYMMDD(load.arrivedAt);
    if (dailyMap[dateStr]) {
      dailyMap[dateStr].truckLoads++;
      dailyMap[dateStr].totalTonnage += tonnage;
    }

    totalTonnageAll += tonnage;
    totalLoadsAll++;

    // Resolve Area
    let areaName = 'Unassigned';
    let barangays = [];
    if (load.routeId) {
      areaName = load.routeId.name;
      barangays = load.routeId.barangay || [];
    } else if (load.staffId?.assignedRouteId) {
      areaName = load.staffId.assignedRouteId.name;
      barangays = load.staffId.assignedRouteId.barangay || [];
    } else if (load.staffId?.location) {
      areaName = load.staffId.location;
    }

    if (!areaMap[areaName]) {
      areaMap[areaName] = { area: areaName, barangays: new Set(barangays), truckLoads: 0, tonnage: 0 };
    }
    areaMap[areaName].truckLoads++;
    areaMap[areaName].tonnage += tonnage;
    barangays.forEach(b => areaMap[areaName].barangays.add(b));

    // Resolve Staff
    const staffName = load.staffId ? load.staffId.name : 'Unknown';
    const staffKey = `${staffName}-${areaName}`;
    if (!staffMap[staffKey]) {
      staffMap[staffKey] = { staff: staffName, area: areaName, loads: 0, tonnage: 0 };
    }
    staffMap[staffKey].loads++;
    staffMap[staffKey].tonnage += tonnage;

    // Log Entry
    loadLogs.push({
      logId: load.clientSubmissionId || load._id.toString(),
      datetime: formatManilaDateTime(load.arrivedAt),
      plateNo: load.truckPlate,
      area: areaName,
      staff: staffName,
      volInclSlope: (load.volumeCubicM || 0) + (load.slope || 0),
      slope: load.slope || 0,
      tonnage: tonnage,
      auditAttached: !!(load.photoUrl || load.sidePhotoUrl || load.backPhotoUrl)
    });
  });

  let peakDay = null;
  const chartData = [];
  const dailyBreakdown = [];

  dateList.forEach((d) => {
    const data = dailyMap[d];
    if (data.truckLoads > 0) {
      data.avgPerLoad = data.totalTonnage / data.truckLoads;
    }
    if (!peakDay || data.totalTonnage > peakDay.tonnage) {
      peakDay = { date: d, tonnage: data.totalTonnage };
    }
    chartData.push({ date: d, tonnage: data.totalTonnage });
    dailyBreakdown.push({
      date: d,
      truckLoads: data.truckLoads,
      totalTonnage: data.totalTonnage,
      avgPerLoad: data.avgPerLoad
    });
  });

  const collectionByArea = Object.values(areaMap).map(a => ({
    area: a.area,
    barangays: Array.from(a.barangays).join(', '),
    truckLoads: a.truckLoads,
    tonnage: a.tonnage,
    share: totalTonnageAll > 0 ? (a.tonnage / totalTonnageAll) * 100 : 0
  })).sort((a, b) => b.tonnage - a.tonnage);

  const submissionsByStaff = Object.values(staffMap).sort((a, b) => b.tonnage - a.tonnage);

  return {
    summary: {
      totalTonnage: totalTonnageAll,
      dailyAverage: dateList.length > 0 ? totalTonnageAll / dateList.length : 0,
      peakDay: peakDay && peakDay.tonnage > 0 ? peakDay : null,
      truckLoads: totalLoadsAll,
    },
    chartData,
    dailyBreakdown,
    collectionByArea,
    submissionsByStaff,
    loadLogs
  };
}

module.exports = {
  getTonnageTrendData,
  getManilaDateBounds
};
