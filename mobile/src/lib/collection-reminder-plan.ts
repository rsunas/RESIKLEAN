import type { UpcomingCollection } from '../types/resident-schedule';

export type CollectionReminder = {
  id: string;
  date: string;
  wasteType: UpcomingCollection['wasteType'];
  window: string;
  phase: 'start' | 'end';
  dueAt: number;
  expiresAt: number;
};

function timeMinutes(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 1 || hours > 12 || minutes > 59) return null;
  return (hours % 12 + (match[3].toUpperCase() === 'PM' ? 12 : 0)) * 60 + minutes;
}

// Naga's calendar/time zone, independent of the phone's current time zone.
export function collectionDateKey(value: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp + 8 * 3600000).toISOString().slice(0, 10) : null;
}

export function buildCollectionReminderPlan(collections: UpcomingCollection[], ownerId: string, location: string): CollectionReminder[] {
  const reminders = new Map<string, CollectionReminder>();
  for (const collection of collections) {
    const day = collectionDateKey(collection.date);
    if (!day) continue;
    const midnight = Date.parse(`${day}T00:00:00+08:00`);
    if (!Number.isFinite(midnight)) continue;
    for (const window of collection.timeWindows || []) {
      const parts = window.split(/\s*[-\u2013\u2014]\s*/);
      if (parts.length !== 2) continue;
      const start = timeMinutes(parts[0]);
      const end = timeMinutes(parts[1]);
      if (start === null || end === null || start === end) continue;
      const startAt = midnight + start * 60000;
      const endAt = midnight + (end + (end < start ? 1440 : 0)) * 60000;
      // Time values (rather than list index) keep identity stable on refresh/reorder.
      const base = `collection-reminder:v2:${encodeURIComponent(ownerId)}:${encodeURIComponent(location.trim().toLowerCase())}:${day}:${collection.wasteType}:${start}-${end}`;
      for (const phase of ['start', 'end'] as const) {
        const id = `${base}:${phase}`;
        reminders.set(id, { id, date: collection.date, wasteType: collection.wasteType, window, phase, dueAt: phase === 'start' ? startAt : endAt, expiresAt: endAt });
      }
    }
  }
  return [...reminders.values()].sort((a, b) => a.dueAt - b.dueAt);
}

export function shouldScheduleReminder(reminder: CollectionReminder, now: number, receipt: number | undefined, pending: boolean): boolean {
  if (pending) return false;
  // A past receipt means the OS already accepted this alert. Do not replay it.
  if (receipt !== undefined && receipt <= now) return false;
  // Catch up only during an active window, never replay a day's expired alerts.
  return reminder.phase === 'start' ? now < reminder.expiresAt : now <= reminder.dueAt;
}
