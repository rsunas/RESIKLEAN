import { today } from '@internationalized/date';

export function tonnagePreset(key = 'week') {
  const end = today('Asia/Manila');
  const start = key === 'month' ? end.set({ day: 1 }) : end.subtract({ days: key === 'thirty' ? 29 : 6 });
  return { start, end };
}

export function tonnageRangeError(range) {
  if (!range?.start || !range?.end) return 'Choose a start and end date.';
  if (range.start.compare(range.end) > 0) return 'Start date must be on or before end date.';
  if (range.end.compare(today('Asia/Manila')) > 0) return 'Choose today or an earlier date.';
  if (range.end.compare(range.start.add({ days: 91 })) > 0) return 'Choose a range of up to 92 days.';
  return '';
}

export function tonnageRangeLabel(range) {
  const format = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' });
  return `${format.format(range.start.toDate('Asia/Manila'))} to ${format.format(range.end.toDate('Asia/Manila'))}`;
}
