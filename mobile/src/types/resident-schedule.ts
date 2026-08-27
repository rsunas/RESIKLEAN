export type ApiWasteType = 'biodegradable' | 'non-biodegradable';

export type ScheduleEntry = {
  wasteType: ApiWasteType;
  days: string[];
  timeWindows: string[];
};

export type UpcomingCollection = {
  date: string;
  dayName: string;
  wasteType: ApiWasteType;
  timeWindows: string[];
};

export type ScheduleData = {
  location: string;
  area: string;
  shift: 'day' | 'night';
  today: string;
  todayWasteType: ApiWasteType | null;
  nextCollection: string | null;
  nextWasteType: ApiWasteType | null;
  schedules: ScheduleEntry[];
  upcomingCollections: UpcomingCollection[];
};

export type CollectionLocationOption = {
  _id: string;
  name: string;
  area: string;
  type: 'barangay' | 'street' | 'subdivision' | 'cbd' | 'landmark';
  shift: 'day' | 'night';
};

export type LegacyScheduleData = {
  barangay: string;
  today: string;
  routes: Array<{
    routeId: string;
    name: string;
    barangay: string;
    weeklyPattern: string[];
    nextCollection: string | null;
    nextWasteType: ApiWasteType;
    isToday: boolean;
    todayWasteType: ApiWasteType | null;
  }>;
  upcomingCollections: Array<{
    date: string;
    dayName: string;
    wasteType: ApiWasteType;
    collections: Array<{ routeId: string; name: string }>;
  }>;
};
