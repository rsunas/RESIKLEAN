const { sendSuccess, sendError } = require('../utils/response');
const { TYPES, listNotifications } = require('../services/adminNotifications');
const Read = require('../models/AdminNotificationRead');
const Report = require('../models/MissedReport');
const Message = require('../models/ReportMessage');
const Load = require('../models/TruckLoad');
const { attachTruckNumbers } = require('../utils/registeredTruckNumbers');
const validId = value => /^(complaint|reply|truckload|route):[a-f0-9]{24}$/i.test(value);
const list = async (req, res) => {
  const { type = 'all', unread = 'false', page = '1', limit = '10' } = req.query;
  if (!['all', ...TYPES].includes(type) || !['true', 'false'].includes(unread) || !/^\d+$/.test(page) || !/^\d+$/.test(limit) || Number(page) < 1 || Number(page) > 100000 || Number(limit) < 1 || Number(limit) > 50) return sendError(res, 'Invalid notification filters', 400);
  try { sendSuccess(res, await listNotifications(req.user._id, { type, unread: unread === 'true', page: Number(page), limit: Number(limit) })); }
  catch { sendError(res, 'Notifications could not be loaded. Please retry.', 500); }
};
const markRead = async (req, res) => {
  const ids = req.body?.ids;
  if (!Array.isArray(ids) || !ids.length || ids.length > 50 || ids.some(id => typeof id !== 'string' || !validId(id))) return sendError(res, 'Provide up to 50 valid notification identifiers', 400);
  try {
    // Reading an event never changes the complaint or collection record.
    await Read.bulkWrite([...new Set(ids)].map(eventId => ({ updateOne: { filter: { adminId: req.user._id, eventId }, update: { $setOnInsert: { readAt: new Date() } }, upsert: true } })), { ordered: false });
    sendSuccess(res, { read: true });
  } catch (error) {
    // Concurrent tabs may both insert the same receipt; that is already read.
    if (error.code === 11000 && error.writeErrors?.every(item => item.code === 11000)) return sendSuccess(res, { read: true });
    sendError(res, 'Could not mark notifications as read. Please retry.', 500);
  }
};
const target = async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 'Invalid notification identifier', 400);
  try {
    const [type, id] = req.params.id.split(':'); let data;
    if (type === 'truckload') {
      data = await Load.findById(id).populate('staffId', 'name').populate('routeId', 'name').lean();
      if (data) await attachTruckNumbers(data);
    }
    else if (type === 'complaint') data = await Report.findById(id).populate('residentId', 'name').lean();
    else if (type === 'reply') {
      const message = await Message.findOne({ _id: id, senderRole: 'resident' }).lean();
      if (message) data = await Report.findById(message.reportId).populate('residentId', 'name').lean();
    }
    if (!data) return sendError(res, 'This record is no longer available.', 404);
    sendSuccess(res, { record: data });
  } catch { sendError(res, 'Could not open this record. Please retry.', 500); }
};
module.exports = { list, markRead, target };
