const Announcement = require('../models/Announcement');
const Route = require('../models/Route');
const Truck = require('../models/Truck');
const User = require('../models/User');
const { uploadPhoto, deletePhoto } = require('../services/cloudinary.service');
const { sendPushNotifications } = require('../services/notification.service');
const { emitToResidents } = require('../services/socket.service');
const { sendSuccess, sendError } = require('../utils/response');
const shared = () => import('../shared/announcements.mjs');
const fail = message => { const error = new Error(message); error.status = 400; throw error; };
const validId = id => typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);
const populate = query => query.populate('affectedTruckId', 'truckNumber plateNumber').populate('areaId', 'name');
const publicItem = (item, affectsMyArea) => ({ id: String(item._id), imageUrl: item.imageUrl || null, message: item.message, type: item.type, reason: item.reason, areaId: item.areaId ? String(item.areaId._id || item.areaId) : null, areaLabel: item.areaLabel, scheduledFor: item.scheduledFor, publishedAt: item.publishedAt, affectsMyArea: Boolean(affectsMyArea), hasArea: Boolean(item.areaId) });
const escapeRegex = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const audience = item => item.areaId ? { role: 'resident', $or: [{ home_segment_id: item.areaId }, { barangay: { $in: item.audienceBarangays.map(name => new RegExp(`^${escapeRegex(name)}$`, 'i')) } }, { location: { $in: item.audienceBarangays.map(name => new RegExp(`^${escapeRegex(name)}$`, 'i')) } }] } : { role: 'resident' };
async function cleanup(publicId) {
  if (publicId) await deletePhoto(publicId).catch(error => console.error('Announcement image cleanup failed:', publicId, error.message));
}
async function notifyPublished(item) {
  // A lifetime claim prevents repeated alerts after retries, edits or republishing.
  const claimed = await Announcement.findOneAndUpdate({ _id: item._id, status: 'published', notifiedAt: null }, { $set: { notifiedAt: new Date() } }, { new: true });
  if (!claimed) return;
  const residents = await User.find(audience(item)).select('_id pushTokens notificationsEnabled settings');
  emitToResidents('announcement:new', residents.map(user => String(user._id)), publicItem(item));
  const { manilaParts, formatTime } = await shared();
  const tokens = new Set(residents.filter(user => user.notificationsEnabled !== false && user.settings?.notifications?.pushEnabled !== false && user.settings?.notifications?.announcements !== false).flatMap(user => (user.pushTokens || []).filter(token => token.isEnabled !== false).map(token => token.token)));
  await sendPushNotifications([...tokens].map(to => ({ to, sound: 'default', badge: 1, title: `Service advisory: ${item.areaLabel} · ${formatTime(manilaParts(item.scheduledFor).time)}`, body: item.message, data: { type: 'announcement', announcementId: String(item._id) } })));
}
async function fields(body, existing) {
  const { scheduledDate, manilaParts, generateMessage } = await shared();
  const value = existing ? { type: existing.type, reason: existing.reason, impact: existing.impact, areaId: existing.areaId, areaLabel: existing.areaLabel, audienceBarangays: existing.audienceBarangays, affectedTruckId: existing.affectedTruckId, scheduledFor: existing.scheduledFor, newDate: existing.newDate, message: existing.message, status: existing.status } : { status: 'draft' };
  for (const key of ['type', 'reason', 'impact']) {
    const text = body[key] ?? value[key];
    if (typeof text !== 'string' || !text.trim() || text.length > 80 || /[<>\r\n]/.test(text)) fail(`Enter a valid ${key} within 80 characters.`);
    value[key] = text.trim();
  }
  if (body.status !== undefined) value.status = body.status;
  if (!['draft', 'published'].includes(value.status)) fail('Choose a valid status.');
  if (body.areaId !== undefined || !existing) {
    if (body.areaId === 'all') Object.assign(value, { areaId: null, areaLabel: 'All areas', audienceBarangays: [] });
    else {
      if (!validId(body.areaId)) fail('Choose a valid area.');
      const route = await Route.findOne({ _id: body.areaId, isActive: { $ne: false } });
      if (!route) fail('This area is no longer available.');
      Object.assign(value, { areaId: route._id, areaLabel: route.name, audienceBarangays: route.barangay || [] });
    }
  }
  if (body.affectedTruckId !== undefined || !existing) {
    value.affectedTruckId = body.affectedTruckId || null;
    if (value.affectedTruckId && (!validId(value.affectedTruckId) || !await Truck.exists({ _id: value.affectedTruckId, isActive: { $ne: false } }))) fail('Choose an available truck.');
  }
  const previous = existing ? manilaParts(existing.scheduledFor) : {};
  try { value.scheduledFor = scheduledDate(body.date ?? previous.date, body.time ?? previous.time); } catch (error) { fail(error.message); }
  value.newDate = value.impact === 'Rescheduled' ? (body.newDate ?? value.newDate) : null;
  if (value.impact === 'Rescheduled') {
    try { scheduledDate(value.newDate, '00:00'); } catch { fail('Choose a valid new date.'); }
  }
  if (body.message !== undefined && typeof body.message !== 'string') fail('Message must be text.');
  value.message = body.message !== undefined ? body.message.replace(/<[^>]*>/g, '').trim() : value.message ?? generateMessage({ ...value, ...manilaParts(value.scheduledFor) });
  if (value.message.length > 500) fail('Keep the message within 500 characters.');
  if (value.status === 'published' && !value.message) fail('Add a message before publishing.');
  return value;
}
exports.options = async (req, res) => {
  try {
    const [areas, trucks] = await Promise.all([Route.find({ isActive: { $ne: false } }).select('name').sort({ name: 1 }).lean(), Truck.find({ isActive: { $ne: false } }).select('truckNumber plateNumber').sort({ truckNumber: 1 }).lean()]);
    return sendSuccess(res, { areas, trucks });
  } catch { return sendError(res, 'Unable to load areas and trucks.', 500); }
};
exports.save = async (req, res) => {
  let uploaded;
  try {
    const updating = Boolean(req.params.id);
    if (updating && !validId(req.params.id)) fail('Invalid announcement.');
    let item = updating ? await Announcement.findById(req.params.id) : null;
    if (updating && !item) return sendError(res, 'Announcement not found.', 404);
    if (!updating) {
      if (typeof req.body.requestKey !== 'string' || !/^[a-z\d-]{16,80}$/i.test(req.body.requestKey)) fail('A valid request key is required.');
      const duplicate = await populate(Announcement.findOne({ createdBy: req.user._id, requestKey: req.body.requestKey }));
      if (duplicate) return sendSuccess(res, duplicate);
    } else if (req.body.version === undefined || Number(req.body.version) !== item.__v) return sendError(res, 'This announcement changed. Reload it before saving.', 409);
    const value = await fields(req.body, item);
    const changedArtwork = item && (['type', 'reason', 'areaLabel', 'impact', 'newDate'].some(key => String(item[key] ?? '') !== String(value[key] ?? '')) || +item.scheduledFor !== +value.scheduledFor);
    if (value.status === 'published' && !req.file && (!item?.imageUrl || changedArtwork)) fail('Generate a new image before publishing these details.');
    if (req.file) uploaded = await uploadPhoto(req.file.buffer, 'resiklean/announcements');
    const oldImage = item?.imagePublicId;
    const invalidateImage = changedArtwork && !uploaded;
    if (uploaded) Object.assign(value, { imageUrl: uploaded.url, imagePublicId: uploaded.publicId });
    else if (invalidateImage) Object.assign(value, { imageUrl: undefined, imagePublicId: undefined });
    if (value.status === 'published' && item?.status !== 'published') value.publishedAt = new Date();
    if (item) { item.set(value); await item.save(); }
    else item = await Announcement.create({ ...value, createdBy: req.user._id, requestKey: req.body.requestKey });
    uploaded = null; // The DB now owns this asset.
    if (oldImage && (req.file || invalidateImage)) await cleanup(oldImage);
    let warning;
    if (item.status === 'published') await notifyPublished(item).catch(error => { console.error('Announcement delivery failed:', error.message); warning = 'Saved, but notification delivery could not be confirmed.'; });
    await item.populate('affectedTruckId', 'truckNumber plateNumber');
    await item.populate('areaId', 'name');
    return res.status(updating ? 200 : 201).json({ success: true, data: item, warning });
  } catch (error) {
    if (uploaded) await cleanup(uploaded.publicId);
    if (error.code === 11000) {
      const duplicate = await populate(Announcement.findOne({ createdBy: req.user._id, requestKey: req.body.requestKey }));
      if (duplicate) return sendSuccess(res, duplicate);
    }
    return sendError(res, error.status ? error.message : error.name === 'VersionError' ? 'This announcement changed. Reload it before saving.' : 'Could not save the announcement. Please retry.', error.status || (error.name === 'VersionError' ? 409 : 500));
  }
};
exports.list = async (req, res) => {
  try {
    const cursor = typeof req.query.cursor === 'string' && req.query.cursor ? req.query.cursor : null;
    const limit = Math.min(50, Math.max(1, Number.parseInt(req.query.limit, 10) || 10));
    let filter = {};
    const resident = req.user.role === 'resident';
    if (resident) {
      const names = [req.user.barangay, req.user.location].filter(Boolean).map(name => new RegExp(`^${escapeRegex(name)}$`, 'i'));
      filter = req.query.scope === 'all' ? { status: 'published' } : { status: 'published', $or: [{ areaId: null }, ...(req.user.home_segment_id ? [{ areaId: req.user.home_segment_id }] : []), { audienceBarangays: { $in: names } }] };
    }
    if (resident && cursor) {
      const decoded = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
      if (decoded.length === 2 && !Number.isNaN(Date.parse(decoded[0])) && validId(decoded[1])) filter.$and = [{ $or: [{ publishedAt: { $lt: new Date(decoded[0]) } }, { publishedAt: new Date(decoded[0]), _id: { $lt: decoded[1] } }] }];
    }
    const items = await populate(Announcement.find(filter)).sort(resident ? { publishedAt: -1, _id: -1 } : { createdAt: -1, _id: -1 }).limit(limit + 1).lean();
    const hasMore = resident && items.length > limit;
    const pageItems = hasMore ? items.slice(0, limit) : items;
    const last = pageItems[pageItems.length - 1];
    const nextCursor = hasMore && last ? Buffer.from(`${new Date(last.publishedAt).toISOString()}|${last._id}`).toString('base64url') : null;
    const areaIds = resident ? new Set([req.user.home_segment_id].filter(Boolean).map(String)) : new Set();
    return sendSuccess(res, { items: resident ? pageItems.map(item => publicItem(item, !item.areaId || areaIds.has(String(item.areaId)) || (item.audienceBarangays || []).some(name => [req.user.barangay, req.user.location].filter(Boolean).some(value => String(value).toLowerCase() === String(name).toLowerCase())))) : pageItems, nextCursor, hasMore, limit });
  } catch { return sendError(res, 'Unable to load announcements.', 500); }
};
exports.detail = async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 'Invalid announcement.');
  try {
    const item = await populate(Announcement.findById(req.params.id));
    return item ? sendSuccess(res, item) : sendError(res, 'Announcement not found.', 404);
  } catch { return sendError(res, 'Unable to load announcement.', 500); }
};
exports.remove = async (req, res) => {
  if (!validId(req.params.id)) return sendError(res, 'Invalid announcement.');
  try {
    const item = await Announcement.findById(req.params.id);
    if (!item) return sendError(res, 'Announcement not found.', 404);
    if (item.imagePublicId) await deletePhoto(item.imagePublicId);
    await item.deleteOne();
    return sendSuccess(res, { deleted: true });
  } catch { return sendError(res, 'Unable to delete the announcement. Please retry.', 500); }
};
exports.publicItem = publicItem;
exports.fields = fields;
