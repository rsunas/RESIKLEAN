export const RANGE_OPTIONS = [{ value: 'today', label: 'Today' }, { value: '7d', label: 'Last 7 days' }, { value: 'month', label: 'This month' }];
export const rangeLabel = value => value === 'all' ? 'All dates' : RANGE_OPTIONS.find(option => option.value === value)?.label || value;
export const number = value => value == null ? '—' : value.toLocaleString('en-PH');
export const rate = value => value == null ? '—' : `${number(value)}%`;
export const hourLabel = hour => `${hour % 12 || 12} ${hour < 12 ? 'AM' : 'PM'}`;
export const shortDay = day => new Date(`${day}T00:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' });
export const syncTime = date => date ? new Date(date).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'No uploads received';
