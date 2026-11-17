export type CapacityStop = { stopId: string; collectedAt: string; exitedAt?: string };
export const TONNES_PER_STOP = 0.1;
export const TRUCK_DENSITY = 0.294;

// Count completed exits once, including records that are both queued and uploaded.
export function countLoadedStops(logs: CapacityStop[], stopIds: string[], resetTime: number, shiftStart = 0) {
  const allowed = new Set(stopIds);
  const cutoff = Math.max(resetTime, shiftStart);
  return new Set(logs.filter(log => allowed.has(log.stopId)
    && Date.parse(log.exitedAt || log.collectedAt) > cutoff).map(log => log.stopId)).size;
}

export function truckCapacityTonnes(truck?: { length?: number; width?: number; height?: number } | null) {
  const dimensions = [truck?.length, truck?.width, truck?.height].map(Number);
  return dimensions.every(value => Number.isFinite(value) && value > 0)
    ? dimensions.reduce((volume, value) => volume * value, 1) * TRUCK_DENSITY : 0;
}
