import { memo, useCallback, useEffect, useRef, type ComponentProps } from 'react';
import Mapbox, { type ShapeSource, type CircleLayerStyle, type LineLayerStyle, type SymbolLayerStyle } from '@rnmapbox/maps';
import type { StopProperties } from '../lib/driver-map-presentation';

type Filter = NonNullable<ComponentProps<typeof Mapbox.CircleLayer>['filter']>;
const individual: Filter = ['!', ['has', 'point_count']];
const pending: Filter = ['all', individual, ['==', ['get', 'status'], 'pending'], ['!=', ['get', 'next'], true]];
const review: Filter = ['all', individual, ['==', ['get', 'status'], 'review']];
const collected: Filter = ['all', individual, ['==', ['get', 'status'], 'collected']];
const next: Filter = ['all', individual, ['==', ['get', 'next'], true]];
const cluster: Filter = ['has', 'point_count'];
const regularRadius: NonNullable<CircleLayerStyle['circleRadius']> = ['interpolate', ['linear'], ['zoom'], 14, 7, 17, 13];
const nextRadius: NonNullable<CircleLayerStyle['circleRadius']> = ['interpolate', ['linear'], ['zoom'], 14, 12, 17, 17];
const casing: LineLayerStyle = { lineColor: '#ffffff', lineWidth: ['interpolate', ['linear'], ['zoom'], 12, 6, 14, 9.5, 18, 11], lineCap: 'round', lineJoin: 'round' };
// No linear route-distance progress is supplied by the current data model.
const route: LineLayerStyle = { lineColor: '#0A7F4F', lineWidth: ['interpolate', ['linear'], ['zoom'], 12, 3.5, 14, 5, 18, 7], lineCap: 'round', lineJoin: 'round' };
const chevrons: SymbolLayerStyle = { symbolPlacement: 'line', symbolSpacing: 90, textField: '\u203a', textSize: 14, textColor: '#ffffff', textFont: ['Open Sans Bold', 'Arial Unicode MS Regular'], textRotationAlignment: 'map', textKeepUpright: false, textAllowOverlap: false, textIgnorePlacement: true };
const shadow: CircleLayerStyle = { circleRadius: ['interpolate', ['linear'], ['zoom'], 14, 10, 17, 16], circleColor: '#0D2E27', circleOpacity: 0.17, circleBlur: 0.7, circleTranslate: [0, 2] };
const pendingStyle: CircleLayerStyle = { circleColor: '#ffffff', circleStrokeColor: '#0A7F4F', circleStrokeWidth: 2.5, circleRadius: ['interpolate', ['linear'], ['zoom'], 14, 6.5, 17, 13] };
const collectedStyle: CircleLayerStyle = { circleColor: '#0A7F4F', circleStrokeColor: '#ffffff', circleStrokeWidth: 2.5, circleRadius: regularRadius };
const reviewStyle: CircleLayerStyle = { ...collectedStyle, circleColor: '#D97706' };
const numbers: SymbolLayerStyle = { textField: ['to-string', ['get', 'order']], textSize: 11, textFont: ['Open Sans Bold', 'Arial Unicode MS Regular'], textColor: '#0A7F4F', textAllowOverlap: false, textIgnorePlacement: false, textPadding: 2 };
const checks: SymbolLayerStyle = { ...numbers, textField: '\u2713', textColor: '#ffffff' };
// Static soft ring avoids a per-frame JS/native bridge update while panning and
// is inherently safe for reduced motion. No change to trip/location processing.
const nextRing: CircleLayerStyle = { circleColor: '#0A7F4F', circleOpacity: 0.22, circleRadius: ['interpolate', ['linear'], ['zoom'], 14, 22, 17, 27], circleBlur: 0.2 };
const nextStyle: CircleLayerStyle = { ...collectedStyle, circleStrokeWidth: 3.5, circleRadius: nextRadius };
const center: CircleLayerStyle = { circleRadius: 4, circleColor: '#ffffff' };
const clusters: CircleLayerStyle = { circleColor: '#0D2E27', circleRadius: 14, circleStrokeWidth: 3, circleStrokeColor: '#ffffff' };
const clusterCounts: SymbolLayerStyle = { ...numbers, textField: ['to-string', ['get', 'point_count']], textColor: '#ffffff', textSize: 13 };

export const DriverRouteLayers = memo(function DriverRouteLayers({ shape }: { shape: GeoJSON.Feature<GeoJSON.LineString | GeoJSON.MultiLineString> }) {
  return <Mapbox.ShapeSource id="assigned-route-path" shape={shape}>
    <Mapbox.LineLayer id="assigned-route-casing" style={casing} />
    <Mapbox.LineLayer id="assigned-route-line" aboveLayerID="assigned-route-casing" style={route} />
    <Mapbox.SymbolLayer id="assigned-route-directions" aboveLayerID="assigned-route-line" minZoomLevel={14} style={chevrons} />
  </Mapbox.ShapeSource>;
});

type Props = { shape: GeoJSON.FeatureCollection<GeoJSON.Point, StopProperties>; onExpandCluster: (coordinate: [number, number], zoom: number) => void };
export const DriverStopLayers = memo(function DriverStopLayers({ shape, onExpandCluster }: Props) {
  const source = useRef<ShapeSource>(null);
  const request = useRef(0);
  useEffect(() => { request.current += 1; return () => { request.current += 1; }; }, [shape]);
  const onPress = useCallback<NonNullable<ComponentProps<typeof Mapbox.ShapeSource>['onPress']>>(async event => {
    const feature = event.features.find(item => item.properties?.cluster && item.geometry.type === 'Point');
    // Individual stops had no tap action; only the new clusters handle taps.
    if (!feature || feature.geometry.type !== 'Point' || !source.current) return;
    const current = ++request.current;
    try {
      const zoom = await source.current.getClusterExpansionZoom(feature);
      if (request.current === current && Number.isFinite(zoom)) onExpandCluster(feature.geometry.coordinates.slice(0, 2) as [number, number], Math.min(20, zoom + 0.25));
    } catch { /* Leave the current camera in place if the source was removed. */ }
  }, [onExpandCluster]);
  return <Mapbox.ShapeSource ref={source} id="assigned-route-stops" shape={shape} cluster clusterRadius={36} clusterMaxZoomLevel={16} onPress={onPress}>
    <Mapbox.CircleLayer id="route-stop-shadow" filter={individual} style={shadow} />
    <Mapbox.CircleLayer id="route-stop-pending" aboveLayerID="route-stop-shadow" filter={pending} style={pendingStyle} />
    <Mapbox.SymbolLayer id="route-stop-pending-number" aboveLayerID="route-stop-pending" minZoomLevel={16} filter={pending} style={numbers} />
    <Mapbox.CircleLayer id="route-stop-review" aboveLayerID="route-stop-pending-number" filter={review} style={reviewStyle} />
    <Mapbox.CircleLayer id="route-stop-collected" aboveLayerID="route-stop-review" filter={collected} style={collectedStyle} />
    <Mapbox.SymbolLayer id="route-stop-collected-check" aboveLayerID="route-stop-collected" minZoomLevel={16} filter={collected} style={checks} />
    <Mapbox.CircleLayer id="route-stop-next-shadow" aboveLayerID="route-stop-collected-check" filter={next} style={{ ...shadow, circleRadius: nextRadius }} />
    <Mapbox.CircleLayer id="route-stop-next-ring" aboveLayerID="route-stop-next-shadow" filter={next} style={nextRing} />
    <Mapbox.CircleLayer id="route-stop-next" aboveLayerID="route-stop-next-ring" filter={next} style={nextStyle} />
    <Mapbox.CircleLayer id="route-stop-next-center" aboveLayerID="route-stop-next" maxZoomLevel={16} filter={next} style={center} />
    <Mapbox.SymbolLayer id="route-stop-next-number" aboveLayerID="route-stop-next-center" minZoomLevel={16} filter={next} style={{ ...numbers, textColor: '#ffffff' }} />
    <Mapbox.CircleLayer id="route-cluster-shadow" aboveLayerID="route-stop-next-number" filter={cluster} style={{ ...shadow, circleRadius: 18 }} />
    <Mapbox.CircleLayer id="route-cluster" aboveLayerID="route-cluster-shadow" filter={cluster} style={clusters} />
    <Mapbox.SymbolLayer id="route-cluster-count" aboveLayerID="route-cluster" filter={cluster} style={clusterCounts} />
  </Mapbox.ShapeSource>;
});
