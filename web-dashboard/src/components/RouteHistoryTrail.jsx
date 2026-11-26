import { Button } from '@heroui/react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import './RouteHistoryTrail.css';
import { historyTrailLines, historyTrailEndpoints, projectTrailPoint, trailBounds, trailFeatureCollection } from './routeTrailGeometry';
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

function RecordedTrailMap({ recorded, expected, endpoints, focusTravel, children }) {
  const container = useRef(null);
  const fitMap = useRef(null);
  const currentFocus = useRef(focusTravel);
  const [status, setStatus] = useState(MAPBOX_TOKEN ? 'loading' : 'unavailable');
  useEffect(() => { currentFocus.current = focusTravel; fitMap.current?.(); }, [focusTravel]);
  useEffect(() => {
    if (!MAPBOX_TOKEN || !container.current) return;
    let map, observer, disposed = false;
    const markers = [];
    setStatus('loading');
    const timeout = setTimeout(() => { if (!disposed) setStatus('unavailable'); }, 12000);
    try {
      const bounds = trailBounds(recorded, expected, false);
      map = new mapboxgl.Map({ container: container.current, accessToken: MAPBOX_TOKEN,
        style: 'mapbox://styles/mapbox/streets-v12',
        center: bounds ? [(bounds[0][0]+bounds[1][0])/2,(bounds[0][1]+bounds[1][1])/2] : [123.185,13.625],
        zoom: 12, attributionControl: true });
      map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');
      map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');
      map.on('error', () => { if (!disposed) { clearTimeout(timeout); setStatus('unavailable'); } });
      map.on('load', () => {
        if (disposed) return;
        clearTimeout(timeout);
        map.addSource('history-assigned', { type: 'geojson', data: trailFeatureCollection(expected) });
        map.addSource('history-recorded', { type: 'geojson', data: trailFeatureCollection(recorded) });
        map.addLayer({ id: 'history-assigned-line', type: 'line', source: 'history-assigned', filter: ['==', '$type', 'LineString'], paint: { 'line-color': '#71857a', 'line-width': 3, 'line-dasharray': [2, 2] } });
        map.addLayer({ id: 'history-recorded-line', type: 'line', source: 'history-recorded', filter: ['==', '$type', 'LineString'], layout: { 'line-cap': 'round', 'line-join': 'round' }, paint: { 'line-color': '#c53030', 'line-width': 4 } });
        map.addLayer({ id: 'history-recorded-point', type: 'circle', source: 'history-recorded', filter: ['==', '$type', 'Point'], paint: { 'circle-color': '#c53030', 'circle-radius': 5, 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } });
        endpoints.forEach(({ point, label }) => {
          const element = document.createElement('div');
          element.className = 'rh-trail-marker'; element.setAttribute('aria-label',label);
          const caption = document.createElement('span'); caption.textContent = label; element.appendChild(caption);
          markers.push(new mapboxgl.Marker({ element }).setLngLat(point).addTo(map));
        });
        fitMap.current = () => {
          const next = trailBounds(recorded, expected, currentFocus.current);
          if (next) map.fitBounds(next, { padding: 48, maxZoom: 18, duration: 0 });
        };
        map.resize(); fitMap.current(); setStatus('ready');
      });
      observer = new ResizeObserver(() => { map.resize(); fitMap.current?.(); });
      observer.observe(container.current);
    } catch { clearTimeout(timeout); setStatus('unavailable'); }
    return () => { disposed = true; clearTimeout(timeout); fitMap.current = null; observer?.disconnect(); markers.forEach(marker => marker.remove()); map?.remove(); };
  }, [recorded, expected, endpoints]);
  return <>
    <div className="rh-trail-map-frame" data-map-state={status}>
      <div ref={container} className="rh-trail-map" aria-label="Recorded GPS trail and assigned route map" aria-hidden={status !== 'ready'} inert={status !== 'ready' ? true : undefined}/>
      {status !== 'ready' ? <div className="rh-trail-map-fallback">{children}</div> : null}
    </div>
    {status !== 'ready' ? <p className="rh-trail-note" role="status">{status === 'loading' ? 'Loading street map...' : 'Street map unavailable. Showing the uploaded GPS coordinates as a diagram.'}</p> : null}
  </>;
}

export default function RouteHistoryTrail({ data }) {
  const { recorded, expected } = useMemo(() => historyTrailLines(data), [data]);
  const gps = useMemo(() => historyTrailEndpoints(data), [data]);
  const gpsTime = value => value && Number.isFinite(Date.parse(value)) ? new Date(value).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Time unavailable';
  const [focusTravel, setFocusTravel] = useState(false);
  const clipId = useId();
  const points = recorded.flat(), planned = expected.flat();
  const bounds = focusTravel && points.length ? points : [...points, ...planned];
  const project = projectTrailPoint(bounds.length ? bounds : [[123.18, 13.62]]);
  const path = line => line.map(point => project(point).join(',')).join(' ');
  return <div className="rh-trail-view">
    <div className="rh-trail-controls"><Button size="sm" variant="secondary" aria-pressed={!focusTravel} onPress={() => setFocusTravel(false)}>Show full route</Button><Button size="sm" variant="secondary" isDisabled={!points.length} aria-pressed={focusTravel} onPress={() => setFocusTravel(true)}>Focus recorded trail</Button></div>
    <RecordedTrailMap recorded={recorded} expected={expected} endpoints={gps.markers} focusTravel={focusTravel}><div className="rh-trail-diagram"><svg viewBox="0 0 620 280" role="img" aria-label={`Recorded travel: ${points.length} GPS points. Assigned route: ${planned.length} points.`}>
      <defs><clipPath id={clipId}><rect width="620" height="280" /></clipPath></defs>
      <rect fill="#f3f9f5" width="620" height="280" />
      <g clipPath={`url(#${clipId})`}>
        {expected.map((line,index) => line.length > 1 ? <polyline key={`expected-${index}`} data-route-line="assigned" points={path(line)} fill="none" stroke="#9ca9a2" strokeDasharray="7 5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /> : null)}
        {recorded.map((line,index) => line.length > 1 ? <polyline key={`recorded-${index}`} data-route-line="recorded" points={path(line)} fill="none" stroke="#c53030" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" /> : <circle key={`point-${index}`} data-route-point="recorded" cx={project(line[0])[0]} cy={project(line[0])[1]} r="5" fill="#c53030" />)}
        {gps.markers.map(marker => <g key={marker.label} transform={'translate(' + project(marker.point).join(' ') + ')'}><circle r="7" fill={marker.label.startsWith('Start') ? '#c53030' : 'white'} stroke="#c53030" strokeWidth="2" /><text y="-12" textAnchor="middle" fontSize="10" fill="#9b2222">{marker.label}</text></g>)}
      </g>
    </svg></div></RecordedTrailMap>
    <p className="rh-trail-note"><strong>Start (first GPS):</strong> {gpsTime(gps.firstRecordedAt)}{!gps.start ? ' - Location unavailable' : ''}<br/><strong>{gps.ended ? 'End (last GPS)' : 'Last GPS'}:</strong> {gpsTime(gps.lastRecordedAt)}{!gps.end ? ' - Location unavailable' : ''}</p>
    <p className="rh-trail-note" role="status">{points.length ? `${points.length.toLocaleString()} uploaded GPS points${points.length === 1 ? '. One point cannot form a trail yet.' : '. Includes travel outside the assigned route.'}` : 'No uploaded GPS points for this record. If the driver recorded offline, reconnect their app and allow the trip to sync.'}</p>
    <p className="rh-trail-note">If the trail ends early, open the driver's app on an internet connection and let the saved trip sync, then select Refresh trail. A completed trip can still have points waiting to upload.</p>
    <p className="rh-trail-note">Lines connect uploaded GPS points. Start/End mark the first/last recorded GPS positions. They are separate from geofence entry and exit; an End marker does not prove a boundary crossing.</p>
  </div>;
}
