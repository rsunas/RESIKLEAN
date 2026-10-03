import Mapbox from '@rnmapbox/maps';
import { getRouteBounds, type RoutePath } from '@/lib/driver-route-proximity';

const MAP_MARGIN_DEGREES = 0.008;
const MIN_ZOOM = 12;
const MAX_ZOOM = 16;

export type OfflineRouteMapStatus = {
  downloaded: boolean;
  downloading: boolean;
  percentage: number;
  completedSizeBytes: number;
};

const packName = (routeId: string) => `resiklean-assigned-route-${routeId}`;

const toStatus = (status?: { percentage?: number; completedResourceSize?: number; state?: number }): OfflineRouteMapStatus => {
  const percentage = status?.percentage ?? 0;
  return {
    completedSizeBytes: status?.completedResourceSize || 0,
    downloaded: Boolean(status && percentage >= 100),
    downloading: Boolean(status && percentage < 100 && status.state !== 0),
    percentage: Math.round(percentage),
  };
};

export async function getOfflineRouteMapStatus(routeId?: string): Promise<OfflineRouteMapStatus> {
  if (!routeId) return { completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 };
  const pack = await Mapbox.offlineManager.getPack(packName(routeId));
  return pack ? toStatus(await pack.status()) : { completedSizeBytes: 0, downloaded: false, downloading: false, percentage: 0 };
}

export async function downloadOfflineRouteMap({
  onError,
  onProgress,
  routeId,
  routeName,
  routePath,
}: {
  onError?: (message: string) => void;
  onProgress?: (status: OfflineRouteMapStatus) => void;
  routeId: string;
  routeName: string;
  routePath?: RoutePath;
}) {
  const bounds = getRouteBounds(routePath);
  if (!bounds) throw new Error('This assigned route does not include a valid traced road line yet.');

  const [northEast, southWest] = bounds;
  const expandedBounds: [[number, number], [number, number]] = [
    [Math.min(180, northEast[0] + MAP_MARGIN_DEGREES), Math.min(90, northEast[1] + MAP_MARGIN_DEGREES)],
    [Math.max(-180, southWest[0] - MAP_MARGIN_DEGREES), Math.max(-90, southWest[1] - MAP_MARGIN_DEGREES)],
  ];
  const name = packName(routeId);
  const existingPack = await Mapbox.offlineManager.getPack(name);

  if (existingPack) {
    await existingPack.resume();
    const status = toStatus(await existingPack.status());
    onProgress?.(status);
    return status;
  }

  await Mapbox.offlineManager.createPack(
    {
      bounds: expandedBounds,
      maxZoom: MAX_ZOOM,
      metadata: { routeId, routeName },
      minZoom: MIN_ZOOM,
      name,
      styleURL: Mapbox.StyleURL.Street,
    },
    (_pack, status) => onProgress?.(toStatus(status)),
    (_pack, error) => onError?.(error.message || 'Unable to download the map.'),
  );

  return { completedSizeBytes: 0, downloaded: false, downloading: true, percentage: 0 };
}

export async function deleteOfflineRouteMap(routeId: string) {
  const name = packName(routeId);
  const existingPack = await Mapbox.offlineManager.getPack(name);
  if (existingPack) await Mapbox.offlineManager.deletePack(name);
}
