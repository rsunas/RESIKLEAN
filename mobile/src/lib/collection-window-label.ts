/** Presentation only: reminders still receive the original time window. */
export function formatCollectionWindow(window: string, compact = false): string {
  const match = window.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)\s*[-–—]\s*(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return window;
  const [, startHour, startMinute, startPeriod, endHour, endMinute, endPeriod] = match;
  const time = (hour: string, minute: string) => String(Number(hour)) + (compact && minute === '00' ? '' : ':' + minute);
  const startSuffix = startPeriod.toUpperCase();
  const endSuffix = endPeriod.toUpperCase();
  return time(startHour, startMinute) + (startSuffix === endSuffix ? '' : ' ' + startSuffix)
    + (compact ? '–' : ' – ') + time(endHour, endMinute) + ' ' + endSuffix;
}
