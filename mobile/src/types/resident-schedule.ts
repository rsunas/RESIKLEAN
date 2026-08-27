export type ApiWasteType = 'biodegradable' | 'non-biodegradable';

export type ScheduleRoute = {
  routeId: string;
  name: string;
  barangay: string;
  weeklyPattern: string[];
  nextCollection: string | null;
  nextWasteType: ApiWasteType;
  isToday: boolean;
  todayWasteType: ApiWasteType | null;
};

export type UpcomingCollection = {
  date: string;
  dayName: string;
  wasteType: ApiWasteType;
  collections: Array<{ routeId: string; name: string }>;
};

export type ScheduleData = {
  barangay: string;
  today: string;
  routes: ScheduleRoute[];
  upcomingCollections: UpcomingCollection[];
};

const AREA_2_LOCATIONS = new Set([
  'Bagumbayan Sur',
  'Bagumbayan Norte',
  'Calauag',
  'Liboton',
  'Jacob St. / Jacob Putol',
]);

const AREA_2_DAYS = [0, 1, 2, 3, 4, 5, 6];
const AREA_2_WEEKLY_PATTERN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function wasteTypeForDay(day: number): ApiWasteType {
  return day === 0 || day === 4 ? 'non-biodegradable' : 'biodegradable';
}

function getNextCollectionDate(now: Date) {
  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    date.setHours(6, 0, 0, 0);
    if (AREA_2_DAYS.includes(date.getDay()) && date >= now) return date;
  }
  return null;
}

/**
 * Temporary, opt-in fixture for demonstrating the schedule UI with the
 * Area 2 rows from the official SWMO schedule while the backend mapping is
 * being implemented. It is never used unless explicitly enabled in dev.
 */
export function getResidentScheduleFixture(location: string): ScheduleData | null {
  if (!AREA_2_LOCATIONS.has(location)) return null;

  const now = new Date();
  const nextCollection = getNextCollectionDate(now);
  const upcomingCollections: UpcomingCollection[] = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(now);
    date.setDate(now.getDate() + offset);
    date.setHours(6, 0, 0, 0);
    const dayOfWeek = date.getDay();

    if (!AREA_2_DAYS.includes(dayOfWeek)) continue;
    upcomingCollections.push({
      date: date.toISOString(),
      dayName: date.toLocaleDateString('en-PH', { weekday: 'long' }),
      wasteType: wasteTypeForDay(dayOfWeek),
      collections: [{ routeId: 'fixture-area-2', name: 'Area 2 Collection Route' }],
    });
  }

  return {
    barangay: location,
    today: now.toLocaleDateString('en-PH', { weekday: 'long' }),
    routes: [{
      routeId: 'fixture-area-2',
      name: 'Area 2 Collection Route',
      barangay: location,
      weeklyPattern: AREA_2_WEEKLY_PATTERN,
      nextCollection: nextCollection?.toISOString() || null,
      nextWasteType: nextCollection ? wasteTypeForDay(nextCollection.getDay()) : 'biodegradable',
      isToday: AREA_2_DAYS.includes(now.getDay()),
      todayWasteType: AREA_2_DAYS.includes(now.getDay()) ? wasteTypeForDay(now.getDay()) : null,
    }],
    upcomingCollections,
  };
}
