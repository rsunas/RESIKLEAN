// Display features only: never infer collection from proximity to the truck.
export type MapStop = { _id: string; name: string; order: number; longitude: number; latitude: number };
export type StopLog = { stopId: string; status: string; flaggedForReview?: boolean };
export type StopAppearance = 'pending' | 'review' | 'collected';
export type StopProperties = { stopId: string; name: string; order: number; status: StopAppearance; next: boolean };

export function buildMapStops(stops: readonly MapStop[], logs: readonly StopLog[]): GeoJSON.FeatureCollection<GeoJSON.Point, StopProperties> {
  const byId = new Map(logs.filter(log => log.status === 'collected').map(log => [log.stopId, log]));
  const ordered = [...stops].sort((a, b) => a.order - b.order);
  const nextId = ordered.find(stop => !byId.has(stop._id))?._id;
  return {
    type: 'FeatureCollection',
    features: ordered.flatMap(stop => {
      // Do not coerce missing coordinates to zero or move any stop geometry.
      if (stop.longitude == null || stop.latitude == null) return [];
      const longitude = Number(stop.longitude), latitude = Number(stop.latitude);
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || Math.abs(longitude) > 180 || Math.abs(latitude) > 90) return [];
      const log = byId.get(stop._id);
      return [{ type: 'Feature' as const, id: stop._id, geometry: { type: 'Point' as const, coordinates: [longitude, latitude] },
        properties: { stopId: stop._id, name: stop.name, order: stop.order, status: log?.flaggedForReview ? 'review' as const : log ? 'collected' as const : 'pending' as const, next: stop._id === nextId } }];
    }),
  };
}
