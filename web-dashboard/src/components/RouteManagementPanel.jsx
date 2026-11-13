import { Button, Card, Modal } from '@heroui/react';
import mapboxgl from 'mapbox-gl';
import MapboxDraw from '@mapbox/mapbox-gl-draw';
import 'mapbox-gl/dist/mapbox-gl.css';
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import BarangayCombobox from './BarangayCombobox';
import AppSelect from './AppSelect.jsx';
import './RouteEditor.css';

const API_URL = import.meta.env.VITE_API_URL;
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const EMPTY_ROUTE = { name: '', barangayText: '', schedule: [], shift: '', stops: [], routePath: null };

function RouteIcon({ name, size = 18 }) {
  const paths = {
    archive: <><path d="M4 7h16v13H4z" /><path d="M3 4h18v3H3zM9 12h6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    edit: <><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.5 6.5 3 3" /></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    route: <><circle cx="6" cy="6" r="3" /><circle cx="18" cy="18" r="3" /><path d="M9 6h7a4 4 0 0 1 0 8H8a4 4 0 0 0 0 8h4" /></>,
    stop: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /></>,
    upload: <><path d="M12 16V3m0 0-4 4m4-4 4 4M4 14v5h16v-5" /></>,
  };
  return <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{paths[name]}</svg>;
}

function normaliseRoute(route) {
  return {
    ...route,
    id: route._id || route.id,
    barangay: Array.isArray(route.barangay) ? route.barangay : route.barangay ? [route.barangay] : [],
    collectorId: route.collectorId?._id || route.collectorId || '',
    collectorName: route.collectorId?.name || 'Unassigned',
    isActive: route.isActive !== false,
    stops: (route.stops || []).filter((stop) => !stop.isArchived).sort((a, b) => a.order - b.order),
  };
}

function editorFromRoute(route) {
  if (!route) return EMPTY_ROUTE;
  return {
    name: route.name || '',
    barangayText: (route.barangay || []).join(', '),
    schedule: route.schedule || [],
    shift: route.shift || '',
    stops: (route.stops || []).map((stop, index) => ({ ...stop, clientId: stop._id || `stop-${Date.now()}-${index}` })),
    routePath: route.routePath || null,
  };
}

function coordinatesFromFeatures(features) {
  const lines = features.filter((feature) => feature.geometry?.type === 'LineString').map((feature) => feature.geometry.coordinates);
  if (lines.length === 1) return { type: 'LineString', coordinates: lines[0] };
  return lines.length ? { type: 'MultiLineString', coordinates: lines } : null;
}

function featuresFromPath(routePath) {
  if (!routePath?.coordinates) return [];
  const lines = routePath.type === 'MultiLineString' ? routePath.coordinates : [routePath.coordinates];
  return lines.map((coordinates) => ({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates } }));
}

export default function RouteManagementPanel({ token }) {
  const apiBase = API_URL?.replace(/\/$/, '');
  const [mapNode, setMapNode] = useState(null);
  const initialForm = useRef('');
  const mapRef = useRef(null);
  const drawRef = useRef(null);
  const stopMarkers = useRef([]);
  const [routes, setRoutes] = useState([]);
  const [filter, setFilter] = useState('active');
  const [query, setQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const [editorClosing, setEditorClosing] = useState(false);
  useEffect(() => {
    if (!editorClosing) return;
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220;
    const timer = setTimeout(() => { setEditing(null); setEditorClosing(false); setForm(EMPTY_ROUTE); setAddingStops(false); document.querySelector('.route-add-button')?.focus(); }, delay);
    return () => clearTimeout(timer);
  }, [editorClosing]);
  const [form, setForm] = useState(EMPTY_ROUTE);
  const [addingStops, setAddingStops] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const importRef = useRef(null);

  const load = useCallback(async () => {
    if (!apiBase || !token) { setIsLoading(false); setError(!apiBase ? 'VITE_API_URL is not configured.' : 'Sign in as an administrator to manage routes.'); return; }
    setIsLoading(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const routeResponse = await fetch(`${apiBase}/admin/routes`, { headers });
      const routeResult = await routeResponse.json();
      if (!routeResponse.ok || !routeResult.success) throw new Error(routeResult.error || 'Unable to load routes.');
      setRoutes((routeResult.data?.routes || []).map(normaliseRoute));
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : 'Unable to load routes.'); }
    finally { setIsLoading(false); }
  }, [apiBase, token]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!editing || !addingStops) return undefined;
    // Handle this before the modal/document Escape listener and Mapbox Draw.
    const exitStopMode = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setAddingStops(false);
    };
    window.addEventListener('keydown', exitStopMode, true);
    return () => window.removeEventListener('keydown', exitStopMode, true);
  }, [editing, addingStops]);

  const visibleRoutes = useMemo(() => routes.filter((route) => {
    const matchesStatus = filter === 'all' || (filter === 'active' ? route.isActive : !route.isActive);
    const text = `${route.name} ${route.barangay.join(' ')} ${route.collectorName}`.toLowerCase();
    return matchesStatus && (!query.trim() || text.includes(query.trim().toLowerCase()));
  }), [filter, query, routes]);

  const removeMarkers = () => { stopMarkers.current.forEach((marker) => marker.remove()); stopMarkers.current = []; };
  const renderStops = useCallback(() => {
    if (!mapRef.current) return;
    removeMarkers();
    stopMarkers.current = form.stops.filter((stop) => Number.isFinite(Number(stop.longitude)) && Number.isFinite(Number(stop.latitude))).map((stop) => {
      const node = document.createElement('button'); node.className = 'route-stop-marker'; node.type = 'button'; node.textContent = stop.order;
      node.title = stop.name || `Stop ${stop.order}`;
      return new mapboxgl.Marker({ element: node, anchor: 'center' }).setLngLat([Number(stop.longitude), Number(stop.latitude)]).addTo(mapRef.current);
    });
  }, [form.stops]);

  useEffect(() => {
    if (!editing || !MAPBOX_TOKEN || mapRef.current || !mapNode) return undefined;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({ container: mapNode, style: 'mapbox://styles/mapbox/streets-v12', center: [123.1814, 13.6218], zoom: 12 });
    // Preserve Draw's editing handles and filters; customize only the line paint.
    const styles = MapboxDraw.lib.theme.flatMap((style) => style.type === 'line' ? [
      { ...style, id: `${style.id}-casing`, paint: { 'line-color': '#ffffff', 'line-width': 9 } },
      { ...style, paint: { 'line-color': '#0A7F4F', 'line-width': 6 } },
    ] : [style]);
    const draw = new MapboxDraw({ displayControlsDefault: false, controls: { line_string: true, trash: true }, defaultMode: 'simple_select', styles });
    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(mapNode);
    const resizeTimer = setTimeout(() => map.resize(), 220);
    map.addControl(new mapboxgl.NavigationControl(), 'top-right'); map.addControl(draw, 'top-left');
    map.on('load', () => {
      drawRef.current = draw;
      featuresFromPath(form.routePath).forEach((feature) => draw.add(feature));
      form.stops.forEach((stop) => {
        if (!Number.isFinite(Number(stop.longitude)) || !Number.isFinite(Number(stop.latitude))) return;
        const node = document.createElement('button');
        node.className = 'route-stop-marker'; node.type = 'button'; node.textContent = stop.order;
        node.title = stop.name || `Stop ${stop.order}`;
        stopMarkers.current.push(new mapboxgl.Marker({ element: node, anchor: 'center' }).setLngLat([Number(stop.longitude), Number(stop.latitude)]).addTo(map));
      });
    });
    map.on('draw.create', () => setForm((current) => ({ ...current, routePath: coordinatesFromFeatures(draw.getAll().features) })));
    map.on('draw.update', () => setForm((current) => ({ ...current, routePath: coordinatesFromFeatures(draw.getAll().features) })));
    map.on('draw.delete', () => setForm((current) => ({ ...current, routePath: coordinatesFromFeatures(draw.getAll().features) })));
    map.on('click', (event) => {
      if (!addingStops || draw.getMode().startsWith('draw_')) return;
      setForm((current) => ({ ...current, stops: [...current.stops, { clientId: `stop-${Date.now()}`, name: '', expectedTime: '', longitude: event.lngLat.lng, latitude: event.lngLat.lat, order: current.stops.length + 1 }] }));
    });
    mapRef.current = map;
    return () => { clearTimeout(resizeTimer); resizeObserver.disconnect(); removeMarkers(); drawRef.current = null; map.remove(); mapRef.current = null; };
  }, [addingStops, editing, mapNode]);

  useEffect(() => {
    if (!drawRef.current) return;
    const draw = drawRef.current;
    draw.deleteAll();
    featuresFromPath(form.routePath).forEach((feature) => draw.add(feature));
    renderStops();
  }, [form.routePath, renderStops]);
  useEffect(() => { renderStops(); }, [renderStops]);

  const openEditor = (route = null) => { setEditorClosing(false); const next = editorFromRoute(route); initialForm.current = JSON.stringify(next); setEditing(route ? route.id : 'new'); setForm(next); setAddingStops(false); setNotice(''); setError(''); };
  const closeEditor = () => setEditorClosing(true);
  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const toggleDay = (day) => updateForm('schedule', form.schedule.includes(day) ? form.schedule.filter((value) => value !== day) : [...form.schedule, day].sort());
  const updateStop = (clientId, field, value) => setForm((current) => ({ ...current, stops: current.stops.map((stop) => stop.clientId === clientId ? { ...stop, [field]: value } : stop) }));
  const reorderStop = (index, direction) => setForm((current) => {
    const next = [...current.stops]; const target = index + direction; if (target < 0 || target >= next.length) return current;
    [next[index], next[target]] = [next[target], next[index]];
    return { ...current, stops: next.map((stop, order) => ({ ...stop, order: order + 1 })) };
  });
  const removeStop = (clientId) => setForm((current) => ({ ...current, stops: current.stops.filter((stop) => stop.clientId !== clientId).map((stop, index) => ({ ...stop, order: index + 1 })) }));

  const importGeoJson = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ''; if (!file) return;
    try {
      const geojson = JSON.parse(await file.text());
      const features = geojson.type === 'FeatureCollection' ? geojson.features : [geojson];
      const lines = features.filter((feature) => ['LineString', 'MultiLineString'].includes(feature.geometry?.type));
      const points = features.filter((feature) => feature.geometry?.type === 'Point');
      if (!lines.length && !points.length) throw new Error('The file needs at least one LineString, MultiLineString, or Point feature.');
      const lineCoordinates = lines.flatMap((feature) => feature.geometry.type === 'MultiLineString' ? feature.geometry.coordinates : [feature.geometry.coordinates]);
      const importedStops = points.sort((a, b) => Number(a.properties?.order || 0) - Number(b.properties?.order || 0)).map((feature, index) => ({ clientId: `import-${Date.now()}-${index}`, name: feature.properties?.name || `Stop ${index + 1}`, expectedTime: feature.properties?.expectedTime || '', longitude: feature.geometry.coordinates[0], latitude: feature.geometry.coordinates[1], order: Number(feature.properties?.order) || index + 1 }));
      setForm((current) => ({ ...current, routePath: lineCoordinates.length === 1 ? { type: 'LineString', coordinates: lineCoordinates[0] } : lineCoordinates.length ? { type: 'MultiLineString', coordinates: lineCoordinates } : current.routePath, stops: importedStops.length ? importedStops : current.stops }));
      setNotice(`Preview loaded: ${lineCoordinates.length} route line${lineCoordinates.length === 1 ? '' : 's'} and ${importedStops.length} stop${importedStops.length === 1 ? '' : 's'}.`);
    } catch (importError) { setError(importError instanceof Error ? importError.message : 'Unable to import this GeoJSON file.'); }
  };

  const save = async (event) => {
    event.preventDefault();
    const barangay = form.barangayText.split(',').map((value) => value.trim()).filter(Boolean);
    if (!form.name.trim() || !barangay.length || !form.schedule.length || !form.routePath || !form.stops.length) { setError('Add a name, at least one barangay and schedule day, a route path, and one stop.'); return; }
    const stops = form.stops.map((stop, index) => ({ ...(stop._id ? { _id: stop._id } : {}), name: stop.name.trim(), expectedTime: stop.expectedTime || undefined, longitude: Number(stop.longitude), latitude: Number(stop.latitude), order: index + 1 }));
    if (stops.some((stop) => !stop.name || !Number.isFinite(stop.longitude) || !Number.isFinite(stop.latitude))) { setError('Each stop needs a name and valid map coordinates.'); return; }
    setIsSaving(true); setError('');
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const payload = { name: form.name.trim(), barangay, schedule: form.schedule, shift: form.shift || null, stops, routePath: form.routePath };
      let saved;
      if (editing === 'new') {
        const createResponse = await fetch(`${apiBase}/admin/routes`, { method: 'POST', headers, body: JSON.stringify(payload) });
        const createResult = await createResponse.json(); if (!createResponse.ok || !createResult.success) throw new Error(createResult.error || 'Unable to create route.');
        saved = createResult.data;
      } else {
        const response = await fetch(`${apiBase}/admin/routes/${editing}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
        const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save route.'); saved = result.data;
      }
      const next = normaliseRoute(saved);
      setRoutes((current) => editing === 'new' ? [...current, next] : current.map((route) => route.id === next.id ? { ...route, ...next } : route));
      const warnings = saved.warnings || [];
      closeEditor(); setNotice(warnings.length ? `Route saved. Warning: ${warnings.join(' ')}` : 'Route saved successfully.');
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : 'Unable to save route.'); }
    finally { setIsSaving(false); }
  };

  const archiveRoute = async () => {
    if (!archiveTarget) return;
    setIsSaving(true); setError('');
    try {
      const response = await fetch(`${apiBase}/admin/routes/${archiveTarget.id}/archive`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json(); if (!response.ok || !result.success) throw new Error(result.error || 'Unable to archive route.');
      setRoutes((current) => current.map((route) => route.id === archiveTarget.id ? { ...route, isActive: false } : route)); setArchiveTarget(null); setNotice('Route archived.');
    } catch (archiveError) { setError(archiveError instanceof Error ? archiveError.message : 'Unable to archive route.'); }
    finally { setIsSaving(false); }
  };

  return <section className="route-management-panel" aria-label="Route management">
    <Card className="route-directory-card"><div className="route-directory-toolbar"><label className="truck-search-control"><RouteIcon name="map" size={16} /><input aria-label="Search routes" onChange={(event) => setQuery(event.target.value)} placeholder="Search route, barangay, or collector" value={query} /></label><div className="route-filter-tabs" role="group" aria-label="Route status"><button className={filter === 'active' ? 'is-active' : ''} onClick={() => setFilter('active')} type="button">Active</button><button className={filter === 'archived' ? 'is-active' : ''} onClick={() => setFilter('archived')} type="button">Archived</button><button className={filter === 'all' ? 'is-active' : ''} onClick={() => setFilter('all')} type="button">All</button></div><Button className="primary-button route-add-button" onPress={() => openEditor()} startContent={<RouteIcon name="plus" size={16} />}>Add route</Button></div>
      {error && !editing ? <p className="feedback error-feedback" role="alert">{error}</p> : null}{notice && !editing ? <p className="route-management-notice">{notice}</p> : null}
      <div className="route-table-scroll"><table className="route-management-table"><thead><tr><th>Route</th><th>Barangay</th><th>Schedule</th><th>Collector</th><th>Status</th><th>Actions</th></tr></thead><tbody>{isLoading ? <tr><td colSpan="6" className="route-table-message">Loading routes…</td></tr> : null}{!isLoading && !visibleRoutes.length ? <tr><td colSpan="6" className="route-table-message">No routes match this filter.</td></tr> : visibleRoutes.map((route) => <tr key={route.id}><td><strong>{route.name}</strong><small>{route.stops.length} active stop{route.stops.length === 1 ? '' : 's'}</small></td><td>{route.barangay.join(', ') || '—'}</td><td>{route.schedule.map((day) => DAYS[day]).join(', ') || '—'}</td><td>{route.collectorName}</td><td><span className={`route-status ${route.isActive ? 'route-active' : 'route-archived'}`}>{route.isActive ? 'Active' : 'Archived'}</span></td><td><div className="route-row-actions"><button aria-label={`Edit ${route.name}`} className="truck-icon-button" onClick={() => openEditor(route)} type="button"><RouteIcon name="edit" size={16} /></button>{route.isActive ? <button aria-label={`Archive ${route.name}`} className="truck-icon-button truck-archive-button" onClick={() => setArchiveTarget(route)} type="button"><RouteIcon name="archive" size={16} /></button> : null}</div></td></tr>)}</tbody></table></div></Card>

{editing ? <Modal.Backdrop className="route-editor-backdrop" isOpen={!editorClosing} isDismissable={!isSaving && JSON.stringify(form) === initialForm.current} isKeyboardDismissDisabled={addingStops || isSaving} onOpenChange={(open) => { if (!open) closeEditor(); }}>
  <Modal.Container className="route-editor-container" placement="center">
    <Modal.Dialog className="route-editor-modal" aria-labelledby="route-editor-title" onKeyDownCapture={(event) => {
      if (event.key === 'Escape' && addingStops) { event.preventDefault(); event.stopPropagation(); setAddingStops(false); }
    }}>
      <form onSubmit={save}>
        <div className="route-editor-heading">
          <div><p className="eyebrow">Route management</p><h2 id="route-editor-title">{editing === 'new' ? 'Trace a new route' : 'Edit route'}</h2><p>Draw the collection path, then switch to stop mode and click the map in collection order.</p></div>
          <button aria-label="Close route editor" onClick={closeEditor} type="button"><RouteIcon name="close" size={20} /></button>
        </div>
        <div className="route-editor-layout">
          <section className="route-editor-form">
            <label>Route name<div className="route-name-control"><RouteIcon name="route" size={20} /><input autoFocus onChange={(event) => updateForm('name', event.target.value)} placeholder="e.g. Area 1" required value={form.name} /></div></label>
            <BarangayCombobox apiBase={apiBase} onChange={(value) => updateForm('barangayText', value)} value={form.barangayText} />
            <fieldset><legend>Schedule days</legend><div className="route-day-buttons">{DAYS.map((day, index) => <button aria-pressed={form.schedule.includes(index)} className={form.schedule.includes(index) ? 'is-selected' : ''} key={day} onClick={() => toggleDay(index)} type="button">{day}</button>)}</div></fieldset>
            <div className="route-shift-field"><span>Route shift</span><AppSelect aria-label="Route shift" className="route-shift-select" popoverClassName="route-shift-popover" value={form.shift || 'unset'} onChange={(value) => updateForm('shift', value === 'unset' ? '' : value)} options={[{ value: 'unset', label: 'Not set' }, { value: 'AM', label: 'AM' }, { value: 'PM', label: 'PM' }]} /></div>
            <details className="route-advanced-options">
              <summary>Advanced options</summary>
              <p>Import a route and stops prepared in a mapping tool using a GeoJSON file.</p>
              <div className="route-import-row"><input accept=".json,.geojson,application/geo+json,application/json" onChange={importGeoJson} ref={importRef} type="file" /><Button className="outline-button" onPress={() => importRef.current?.click()} type="button" variant="secondary"><RouteIcon name="upload" size={20} />Import GeoJSON</Button></div>
            </details>
            {notice ? <p className="route-management-notice">{notice}</p> : null}
            <section className="route-stops-card" aria-label="Ordered stops">
              <div className="route-stops-heading"><div><strong>Stops</strong><span>{form.stops.length} ordered stop{form.stops.length === 1 ? '' : 's'}</span></div><button aria-pressed={addingStops} className={addingStops ? 'is-adding' : ''} onClick={() => setAddingStops((current) => !current)} type="button"><RouteIcon name="pin" size={18} />{addingStops ? 'Stop adding' : 'Add stops on map'}</button></div>
              {form.stops.length ? <ol className="route-stops-list">{form.stops.map((stop, index) => <li className="route-stop-editor" key={stop.clientId}><b>{stop.order}</b><div><input aria-label={`Stop ${stop.order} name`} onChange={(event) => updateStop(stop.clientId, 'name', event.target.value)} placeholder="Stop name" value={stop.name} /><input aria-label={`Stop ${stop.order} expected time`} onChange={(event) => updateStop(stop.clientId, 'expectedTime', event.target.value)} placeholder="Expected time (optional)" type="time" value={stop.expectedTime || ''} /></div><div className="route-stop-actions"><button aria-label="Move stop up" disabled={!index} onClick={() => reorderStop(index, -1)} type="button">↑</button><button aria-label="Move stop down" disabled={index === form.stops.length - 1} onClick={() => reorderStop(index, 1)} type="button">↓</button><button aria-label="Remove stop" onClick={() => removeStop(stop.clientId)} type="button">×</button></div></li>)}</ol> : <p className="route-stop-empty"><RouteIcon name="pin" size={20} />Use “Add stops on map”, then click each collection point.</p>}
            </section>
            {error ? <p className="route-editor-error" role="alert">{error}</p> : null}
          </section>
          <section className="route-map-section" aria-label="Route drawing map">
            <div className="route-map-toolbar"><span><RouteIcon name="map" size={18} />{addingStops ? 'Stop mode: click map to add a stop' : 'Use the map tools to draw route lines'}</span><small className={form.routePath ? 'has-path' : ''}><i aria-hidden="true" />{form.routePath ? `${form.routePath.type} ready` : 'No route path yet'}</small></div>
            {MAPBOX_TOKEN ? <div className={addingStops ? 'route-map is-adding-stops' : 'route-map'} ref={setMapNode} /> : <div className="route-map-token-missing"><RouteIcon name="map" size={26} /><strong>Mapbox token required</strong><p>Add <code>VITE_MAPBOX_ACCESS_TOKEN=pk…</code> to <code>web-dashboard/.env</code>, then restart Vite.</p></div>}
          </section>
        </div>
        <div className="modal-footer route-editor-footer"><Button className="outline-button" isDisabled={isSaving} onPress={closeEditor} type="button" variant="secondary">Cancel</Button><Button className="primary-button" isDisabled={isSaving} type="submit">{isSaving ? 'Saving…' : 'Save route'}</Button></div>
      </form>
    </Modal.Dialog>
  </Modal.Container>
</Modal.Backdrop> : null}
    {archiveTarget ? <div className="modal-layer" onClick={() => !isSaving && setArchiveTarget(null)} role="presentation"><div aria-modal="true" className="truck-archive-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Archive route</p><h2>Archive {archiveTarget.name}?</h2></div><button aria-label="Close archive confirmation" onClick={() => setArchiveTarget(null)} type="button"><RouteIcon name="close" size={20} /></button></div><p>This keeps the route in history and assignment records but excludes it from active operations.</p><div className="modal-footer"><Button className="outline-button" isDisabled={isSaving} onPress={() => setArchiveTarget(null)} variant="secondary">Cancel</Button><Button className="truck-archive-confirm" isDisabled={isSaving} onPress={archiveRoute}>{isSaving ? 'Archiving…' : 'Archive route'}</Button></div></div></div> : null}
  </section>;
}
