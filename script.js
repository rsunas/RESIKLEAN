const fs = require('fs');

let routes = fs.readFileSync('d:/RESIKLEAN/backend/src/routes/collector.routes.js', 'utf8');
routes = routes.replace(
  "router.post('/route/logs/batch',        batchSyncLogs);    // batch must come before :stopId\r\nrouter.patch('/route/logs/:stopId',     markStop);",
  "router.post('/route/logs/batch',        batchSyncLogs);    // batch must come before :stopId\r\nrouter.post('/route/complete',          completeRoute);\r\nrouter.patch('/route/logs/:stopId',     markStop);"
);
routes = routes.replace(
  "const { getAssignedRoute, markStop, batchSyncLogs, getTodayProgress, getRouteHistory, resolveComplaint, getComplaints, batchSyncTrails, getTrailHistory } = require('../controllers/collector.controller');",
  "const { getAssignedRoute, markStop, batchSyncLogs, getTodayProgress, getRouteHistory, resolveComplaint, getComplaints, batchSyncTrails, getTrailHistory, completeRoute } = require('../controllers/collector.controller');"
)
fs.writeFileSync('d:/RESIKLEAN/backend/src/routes/collector.routes.js', routes);

let ctl = fs.readFileSync('d:/RESIKLEAN/backend/src/controllers/collector.controller.js', 'utf8');
ctl = ctl.replace(
  "    if (!route.schedule.includes(todayNum)) {\r\n      return sendError(res, 'Your route is not scheduled for today', 404);\r\n    }\r\n\r\n    // Sort stops by order field",
  "    if (!route.schedule.includes(todayNum)) {\r\n      return sendError(res, 'Your route is not scheduled for today', 404);\r\n    }\r\n\r\n    const startOfToday = new Date();\r\n    startOfToday.setHours(0, 0, 0, 0);\r\n    const completedSession = await RouteTrailSession.findOne({\r\n      collectorId: req.user._id,\r\n      routeId: route._id,\r\n      status: 'completed',\r\n      startedAt: { $gte: startOfToday }\r\n    }).lean();\r\n\r\n    if (completedSession) {\r\n      return sendError(res, 'You have already completed your route for today', 404);\r\n    }\r\n\r\n    // Sort stops by order field"
);
ctl = ctl.replace(
  "  getTrailHistory,\r\n};",
  "  getTrailHistory,\r\n  completeRoute,\r\n};"
);
fs.writeFileSync('d:/RESIKLEAN/backend/src/controllers/collector.controller.js', ctl);
console.log('Done');
