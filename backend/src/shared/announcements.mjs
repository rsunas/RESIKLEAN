import config from './announcements.json' with { type: 'json' };
export const { types, reasons, impacts, presets } = config;
export const TIME_ZONE = 'Asia/Manila';
export function manilaParts(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}
export function nextHour(now = new Date()) {
  return manilaParts(new Date(Math.floor(new Date(now).getTime() / 3600000) * 3600000 + 3600000));
}
export function scheduledDate(date, time) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time || '')) throw new Error('Choose a valid date and time.');
  const result = new Date(`${date}T${time}:00+08:00`);
  if (!Number.isFinite(result.getTime()) || manilaParts(result).date !== date) throw new Error('Choose a valid date.');
  return result;
}
export function formatTime(time) {
  if (!time) return 'Choose time';
  const [hour, minute] = time.split(':').map(Number);
  return `${hour % 12 || 12}:${String(minute).padStart(2, '0')} ${hour >= 12 ? 'PM' : 'AM'}`;
}
export function formatDay(date, short = false) {
  if (!date) return 'Choose date';
  const value = new Date(`${date}T12:00:00+08:00`);
  if (!Number.isFinite(value.getTime())) return 'Choose date';
  return new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: short ? 'short' : 'long', month: short ? 'short' : 'long', day: 'numeric', ...(short ? {} : { year: 'numeric' }) }).format(value);
}
export function generateMessage(fields, now = new Date()) {
  const { areaLabel = 'All areas', date, time, reason, type, impact, newDate } = fields;
  const today = manilaParts(now).date;
  const tomorrow = manilaParts(new Date(new Date(now).getTime() + 86400000)).date;
  const when = `${date === today ? 'today, ' : date === tomorrow ? 'tomorrow, ' : ''}${formatDay(date)}`;
  const cause = ({ 'Flat tire': 'a flat tire', Accident: 'an accident', 'Engine problem': 'an engine problem', 'Mechanical defect': 'a mechanical defect', 'Bad weather': 'bad weather', 'Road closure': 'a road closure', Holiday: 'the holiday', 'Landfill closure': 'a landfill closure' })[reason] || reason.trim() || 'service changes';
  const action = ({ 'Delays may occur': 'may be delayed', 'Collection postponed': 'is postponed', 'Collection cancelled': 'is cancelled', Rescheduled: `is rescheduled to ${formatDay(newDate)}` })[impact];
  const prefix = type === 'Reminder' ? 'Reminder: ' : type === 'Schedule change' ? 'Schedule update: ' : type && type !== 'Service delay' ? `${type.trim()}: ` : '';
  if (!action) return `${prefix}Collection in ${areaLabel === 'All areas' ? 'all areas' : areaLabel} scheduled for ${formatTime(time)} on ${formatDay(date)}: ${reason.trim() || 'Service update'}. ${impact.trim() || 'Please check for updates'}. Thank you for your patience.`;
  return `${prefix}Collection in ${areaLabel === 'All areas' ? 'all areas' : areaLabel} scheduled for ${formatTime(time)} ${date === today || date === tomorrow ? '' : 'on '}${when} ${action} due to ${cause}. ${impact === 'Collection postponed' ? 'Please wait for the updated schedule. ' : ''}Thank you for your patience.`;
}
