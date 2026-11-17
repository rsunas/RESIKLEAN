const mongoose = require('mongoose');
const Report = require('../models/MissedReport');
const Message = require('../models/ReportMessage');
const Load = require('../models/TruckLoad');
const Session = require('../models/RouteTrailSession');
const Read = require('../models/AdminNotificationRead');
const User = require('../models/User');
const RouteLog = require('../models/RouteLog');

const TYPES = ['complaint', 'reply', 'truckload', 'route'];
const project = (type, fields) => ({ $project: { _id: 0, id: { $concat: [type + ':', { $toString: '$_id' }] }, sourceId: '$_id', type: { $literal: type }, ...fields } });
function buildFeedPipeline(adminId, { type = 'all', unread = false, page = 1, limit = 10 } = {}) {
  const match = { ...(type !== 'all' ? { type } : {}), ...(unread ? { read: false } : {}) };
  return [
    project('complaint', { date: '$createdAt', actorId: '$residentId', subject: '$description', area: '$barangay', targetId: '$_id' }),
    { $unionWith: { coll: Message.collection.name, pipeline: [
      { $match: { senderRole: 'resident' } },
      project('reply', { date: '$createdAt', actorId: '$senderId', subject: '$body', targetId: '$reportId' }),
    ] } },
    { $unionWith: { coll: Load.collection.name, pipeline: [
      project('truckload', { date: '$createdAt', actorId: '$staffId', tonnes: '$tonnesEstimate', plate: '$truckPlate', targetId: '$_id', occurredAt: '$arrivedAt' }),
    ] } },
    { $unionWith: { coll: Session.collection.name, pipeline: [
      // End trip alone is deliberately excluded; only Finish route sets this field.
      { $match: { routeCompletedAt: { $type: 'date' } } },
      project('route', { date: '$routeCompletedAt', actorId: '$collectorId', routeId: '$routeId', routeName: '$routeName', stopIds: '$completionStopIds', eventDate: { $dateToString: { date: '$routeCompletedAt', format: '%Y-%m-%d', timezone: 'Asia/Manila' } } }),
    ] } },
    { $lookup: { from: Read.collection.name, let: { eventId: '$id' }, pipeline: [
      { $match: { adminId: new mongoose.Types.ObjectId(String(adminId)), $expr: { $eq: ['$eventId', '$$eventId'] } } }, { $limit: 1 }, { $project: { _id: 1 } },
    ], as: 'receipt' } },
    { $set: { read: { $gt: [{ $size: '$receipt' }, 0] } } },
    { $facet: {
      unread: [{ $match: { read: false } }, { $count: 'count' }],
      total: [{ $match: match }, { $count: 'count' }],
      items: [{ $match: match }, { $sort: { date: -1, id: -1 } }, { $skip: (page - 1) * limit }, { $limit: limit }, { $unset: 'receipt' }],
    } },
  ];
}
async function listNotifications(adminId, options) {
  const [result] = await Report.aggregate(buildFeedPipeline(adminId, options)).option({ maxTimeMS: 10000 });
  const items = result?.items || [];
  const people = await User.find({ _id: { $in: items.map(item => item.actorId).filter(Boolean) } }).select('name').lean();
  const names = new Map(people.map(person => [String(person._id), person.name]));
  await Promise.all(items.map(async item => {
    const name = names.get(String(item.actorId)) || (item.type === 'truckload' ? 'Staff member' : item.type === 'route' ? 'Driver' : 'Resident');
    if (item.type === 'complaint') {
      item.title = 'New complaint'; item.description = `${name} reported ${item.area ? 'uncollected waste in ' + item.area : 'a collection issue'}.`;
    } else if (item.type === 'reply') {
      item.title = 'Resident replied'; item.description = `${name}: ${String(item.subject || '').slice(0, 180)}`;
    } else if (item.type === 'truckload') {
      const tonnes = Number(item.tonnes);
      item.title = 'New truckload submission'; item.description = `${name} submitted ${Number.isFinite(tonnes) ? tonnes.toLocaleString('en-US', { maximumFractionDigits: 2 }) + ' t' : 'a truckload'} for ${item.plate || 'a truck'}.`;
    } else {
      const stopIds = item.stopIds || [];
      const completed = await RouteLog.distinct('stopId', { collectorId: item.actorId, routeId: item.routeId, eventDate: item.eventDate, status: 'collected', stopId: { $in: stopIds } });
      item.title = 'Route collection finished';
      item.description = `${name} finished ${item.routeName || 'the route'}: ${completed.length} of ${stopIds.length} stops recorded as collected.`;
      item.remaining = Math.max(0, stopIds.length - completed.length);
      item.targetId = `${item.actorId}|${item.routeId}|${item.eventDate}`;
    }
    delete item.stopIds; delete item.actorId; delete item.sourceId; delete item.subject;
  }));
  return { items, total: result?.total?.[0]?.count || 0, unread: result?.unread?.[0]?.count || 0, page: options.page, limit: options.limit };
}
module.exports = { TYPES, buildFeedPipeline, listNotifications };
