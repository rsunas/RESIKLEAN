import type { ScheduleData, UpcomingCollection } from '../types/resident-schedule';
import { collectionDateKey } from './collection-reminder-plan';

/** Keep today's schedule visible even after its collection windows have ended. */
export function getTodayCollections(schedule: ScheduleData | null, day: string): UpcomingCollection[] {
  if (!schedule) return [];
  const date = new Date(`${day}T12:00:00+08:00`);
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long', timeZone: 'Asia/Manila' });
  // Weekly schedules also work when a cached upcoming list has rolled past today.
  if (schedule.schedules.length) {
    return schedule.schedules.filter(entry => entry.days.includes(dayName)).map(entry => ({
      date: day, dayName, wasteType: entry.wasteType, timeWindows: entry.timeWindows,
    }));
  }
  return schedule.upcomingCollections.filter(entry => collectionDateKey(entry.date) === day);
}

/** A rolling week, starting today, using the location's registered weekly pattern. */
export function getWeeklyCollections(schedule: ScheduleData | null, today: string): UpcomingCollection[] {
  const start = Date.parse(`${today}T00:00:00+08:00`);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = collectionDateKey(new Date(start + offset * 86400000).toISOString())!;
    return getTodayCollections(schedule, day);
  }).flat();
}
