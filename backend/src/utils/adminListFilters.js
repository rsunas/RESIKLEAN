const invalid = message => { const error = new Error(message); error.status = 400; throw error; };
const escapeSearch = value => value.replace(/[.*+?^$\x7b\x7d()|[\]\\]/g, '\\$&');
function textSearch(value = '') {
  if (typeof value !== 'string' || value.length > 200) invalid('Search must be text within 200 characters.');
  return value.trim();
}
function dateRange(from = '', to = '') {
  for (const value of [from, to]) {
    if (typeof value !== 'string') invalid('Choose a valid date.');
    if (value && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T00:00:00Z')) || new Date(value + 'T00:00:00Z').toISOString().slice(0,10) !== value)) invalid('Choose a valid date.');
  }
  if (from && to && from > to) invalid('From date must be before or equal to To date.');
  return { ...(from ? { $gte: new Date(from + 'T00:00:00+08:00') } : {}), ...(to ? { $lt: new Date(Date.parse(to + 'T00:00:00+08:00') + 86400000) } : {}) };
}
module.exports = { textSearch, dateRange, escapeSearch };
