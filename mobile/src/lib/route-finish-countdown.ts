/** Gives the driver five full seconds to cancel before any trip data changes. */
export function startRouteFinishCountdown(onTick: (seconds: number) => void, onFinish: () => void) {
  let remaining = 5;
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
