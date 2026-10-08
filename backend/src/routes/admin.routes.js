const express = require('express');
const router = express.Router();
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = require('../middlewares/upload');
const {
  getAllUsers,
  createUser,
  getAllRoutes,
  createRoute,
  updateRoute,
  assignCollector,
  getComplianceReport,
  getAllReports,
  updateReportStatus,
  getTonnageSummary,
  createTruck,
  updateTruck,
  archiveTruck,
  createCycleLog,
  getCycleLogs,
  getAllRouteHistory,
  getRouteHistoryDetail,
  exportRouteHistoryPDF,
  getActiveCyclesMonitoring,
  getTonnageTrendReport,
  exportTonnageTrendPDF,
} = require('../controllers/admin.controller');
const { getMessages, sendMessage } = require('../controllers/message.controller');

router.use(protect, authorize('admin'));

// Users
router.get('/users', getAllUsers);
router.post('/users', upload.single('avatar'), createUser);

// Routes
router.get('/routes', getAllRoutes);
router.post('/routes', createRoute);
router.patch('/routes/:routeId', updateRoute);
router.patch('/routes/:routeId/assign', assignCollector);

// Compliance
router.get('/compliance', getComplianceReport);

// Missed Reports
router.get('/reports', getAllReports);
router.patch('/reports/:reportId', updateReportStatus);

// Report messaging
router.get('/reports/:reportId/messages', getMessages);
router.post('/reports/:reportId/messages', sendMessage);

// Tonnage
router.get('/tonnage', getTonnageSummary);
router.get('/reports/tonnage-trend', getTonnageTrendReport);
router.get('/reports/tonnage-trend/pdf', exportTonnageTrendPDF);

// Trucks
router.post('/trucks', createTruck);
router.patch('/trucks/:truckId', updateTruck);
router.delete('/trucks/:truckId', archiveTruck);

// Cycle Logs (driver-truck-shift mapping)
router.post('/cycle-logs', createCycleLog);
router.get('/cycle-logs', getCycleLogs);

// Monitoring
router.get('/monitoring/capacity', getActiveCyclesMonitoring);

// Route History
router.get('/route-history', getAllRouteHistory);
router.get('/route-history/:id/pdf', exportRouteHistoryPDF);
router.get('/route-history/:id', getRouteHistoryDetail);

module.exports = router;
