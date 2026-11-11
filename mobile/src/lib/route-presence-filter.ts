// Pure GPS decision logic shared by foreground and background delivery.
// These are conservative entry-error guardrails, not a guarantee of GPS accuracy.
export const ROUTE_ENTER_TOLERANCE_METERS = 45;
export const ROUTE_EXIT_TOLERANCE_METERS = 65;
export const ROUTE_MAX_ACCURACY_METERS = 25;
export const ROUTE_MAX_FIX_AGE_MS = 60_000;
export const ROUTE_CONFIRMATION_MS = 10_000;
const MAX_SAMPLE_GAP_MS = 30_000;
const MIN_SAMPLE_GAP_MS = 2_000;
const REQUIRED_SAMPLES = 3;

export type PresenceState = 'unknown' | 'on_route' | 'off_route';
export type PresenceSignal = 'good' | 'poor' | 'stale' | 'confirming';
export type PresenceFix = {
  timestamp: number;
  mocked?: boolean;
  coords: { latitude: number; longitude: number; accuracy: number | null };
};
export type PresenceFilter = {
  state: PresenceState;
  hasEntered: boolean;
  lastFix?: PresenceFix;
  candidate?: { state: PresenceState; since: number; lastAt: number; count: number };
};

export const emptyPresenceFilter = (): PresenceFilter => ({ state: 'unknown', hasEntered: false });

export function evaluateRoutePresence(previous: PresenceFilter, fix: PresenceFix, distance: number, now: number) {
  const reject = (signal: PresenceSignal, preserveCandidate = false) => ({
    filter: preserveCandidate ? previous : { ...previous, candidate: undefined },
    accepted: false, changed: false, signal,
  });
  if (!Number.isFinite(fix.timestamp) || fix.timestamp <= 0 || fix.timestamp > now + 5_000 || now - fix.timestamp > ROUTE_MAX_FIX_AGE_MS) return reject('stale');
  // Foreground and background can deliver the same fix. Never count it twice.
  if (previous.lastFix && fix.timestamp <= previous.lastFix.timestamp) return reject('stale', true);
  const { latitude, longitude, accuracy } = fix.coords;
  if (fix.mocked || !Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180
    || accuracy === null || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > ROUTE_MAX_ACCURACY_METERS
    || !Number.isFinite(distance) || distance < 0) return reject('poor');

  if (previous.lastFix) {
    const elapsed = fix.timestamp - previous.lastFix.timestamp;
    if (elapsed < MIN_SAMPLE_GAP_MS) return reject('confirming', true);
    // Reject sudden GPS jumps; subtract both accuracy radii before testing speed.
    if (elapsed <= ROUTE_MAX_FIX_AGE_MS) {
      const last = previous.lastFix.coords;
      const radians = Math.PI / 180;
      const x = (longitude - last.longitude) * radians * Math.cos(latitude * radians);
      const y = (latitude - last.latitude) * radians;
      const movement = Math.max(0, Math.hypot(x, y) * 6_371_008.8 - accuracy - (last.accuracy ?? 0));
      if (movement / (elapsed / 1000) > 45) return reject('poor');
    }
  }

  const filter: PresenceFilter = { ...previous, lastFix: fix };
  // Require the reported accuracy circle to be fully inside/outside the band.
  const target = distance + accuracy <= ROUTE_ENTER_TOLERANCE_METERS ? 'on_route'
    : distance - accuracy > ROUTE_EXIT_TOLERANCE_METERS ? 'off_route' : null;
  if (!target || target === previous.state) {
    filter.candidate = undefined;
    return { filter, accepted: true, changed: false, signal: 'good' as PresenceSignal };
  }
  const candidate = previous.candidate;
  filter.candidate = candidate?.state === target && fix.timestamp - candidate.lastAt <= MAX_SAMPLE_GAP_MS
    ? { ...candidate, lastAt: fix.timestamp, count: candidate.count + 1 }
    : { state: target, since: fix.timestamp, lastAt: fix.timestamp, count: 1 };
  if (filter.candidate.count >= REQUIRED_SAMPLES && fix.timestamp - filter.candidate.since >= ROUTE_CONFIRMATION_MS) {
    filter.state = target;
    filter.hasEntered = previous.hasEntered || target === 'on_route';
    filter.candidate = undefined;
    return { filter, accepted: true, changed: true, signal: 'good' as PresenceSignal };
  }
  return { filter, accepted: true, changed: false, signal: 'confirming' as PresenceSignal };
}

export function monitoringDay(now = new Date()) {
  // Explicit ISO day key, independent of the phone's locale/timezone.
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function mayAutoArm(preference: { consent: boolean | null; pausedDay: string | null }, day: string) {
  return preference.consent === true && preference.pausedDay !== day;
}
