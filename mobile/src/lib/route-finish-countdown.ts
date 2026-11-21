export const ROUTE_FINISH_COUNTDOWN_SECONDS = 3;

/** Gives the driver three full seconds to cancel before any trip data changes. */
export function startRouteFinishCountdown(onTick: (seconds: number) => void, onFinish: () => void) {
  let remaining = ROUTE_FINISH_COUNTDOWN_SECONDS;
  let cancelled = false;
  onTick(remaining);
  const timer = setInterval(() => {
    if (cancelled) return;
    remaining -= 1;
    if (remaining === 0) {
      cancelled = true;
      clearInterval(timer);
      onFinish();
    } else {
      onTick(remaining);
    }
  }, 1000);
  return () => {
    cancelled = true;
    clearInterval(timer);
  };
}
