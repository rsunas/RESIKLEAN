import { Button, Card } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function routeArea(route) {
  if (Array.isArray(route.barangay)) return route.barangay.filter(Boolean).join(', ') || 'No area set';
  return route.barangay || 'No area set';
}

function routeSchedule(route) {
  if (!Array.isArray(route.schedule) || route.schedule.length === 0) return 'No schedule set';
  return [...route.schedule]
    .sort((left, right) => left - right)
    .map((day) => DAYS[day] || day)
    .join(', ');
}

function collectorId(route) {
  return typeof route.collectorId === 'object' ? route.collectorId?._id : route.collectorId;
}

function routeLabel(route) {
  return route.name || 'Unnamed route';
}

export default function RouteAssignmentPanel({ token }) {
  const apiBase = API_URL?.replace(/\/$/, '');
  const [routes, setRoutes] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [selections, setSelections] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAssignments = useCallback(async () => {
    if (!apiBase || !token) {
      setError(!apiBase ? 'VITE_API_URL is not configured.' : 'Sign in as an administrator to manage route assignments.');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError('');
    try {
      const [routesResponse, usersResponse] = await Promise.all([
        fetch(`${apiBase}/admin/routes`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${apiBase}/admin/users`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const [routesResult, usersResult] = await Promise.all([routesResponse.json(), usersResponse.json()]);

      if (!routesResponse.ok || !routesResult.success) throw new Error(routesResult.error || 'Unable to load routes.');
      if (!usersResponse.ok || !usersResult.success) throw new Error(usersResult.error || 'Unable to load collectors.');

      const nextRoutes = routesResult.data?.routes || [];
      const nextCollectors = (usersResult.data?.users || [])
        .filter((user) => user.role === 'collector')
        .sort((left, right) => (left.name || '').localeCompare(right.name || ''));

      setRoutes(nextRoutes);
      setCollectors(nextCollectors);
      setSelections(Object.fromEntries(nextCollectors.map((collector) => {
        const assignedRoute = nextRoutes.find((route) => collectorId(route) === collector._id);
        return [collector._id, assignedRoute?._id || ''];
      })));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load route assignments.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const assignedCount = useMemo(
    () => collectors.filter((collector) => routes.some((route) => collectorId(route) === collector._id)).length,
    [collectors, routes]
  );

  const assignRoute = async (collector) => {
    const nextRouteId = selections[collector._id];
    if (!nextRouteId || !apiBase) return;

    setError('');
    setSuccess('');
    setIsSaving(collector._id);
    try {
      const response = await fetch(`${apiBase}/admin/routes/${encodeURIComponent(nextRouteId)}/assign`, {
        body: JSON.stringify({ collectorId: collector._id }),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        method: 'PATCH',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to assign this route.');

      setRoutes((current) => current.map((route) => route._id === nextRouteId ? result.data : route));
      setSuccess(`${result.data.name || 'Route'} was assigned to ${collector.name || 'the driver'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to assign this route.');
    } finally {
      setIsSaving('');
    }
  };

  return <Card className="route-assignment-card">
    <div className="route-assignment-toolbar">
      <p>{isLoading ? 'Loading drivers…' : `${assignedCount} of ${collectors.length} drivers assigned`}</p>
      <Button className="outline-button" isDisabled={isLoading} onPress={loadAssignments} variant="secondary">Refresh</Button>
    </div>
    {success ? <p className="feedback success-feedback" role="status">{success}</p> : null}
    {error ? <p className="feedback error-feedback" role="alert">{error}</p> : null}
    <div className="table-scroll">
      <table className="route-assignment-table">
        <thead><tr><th>Driver</th><th>Assigned route</th><th>Area</th><th>Schedule</th><th>Action</th></tr></thead>
        <tbody>
          {isLoading ? <tr><td className="route-assignment-message" colSpan="5">Loading current assignments…</td></tr> : null}
          {!isLoading && !error && collectors.length === 0 ? <tr><td className="route-assignment-message" colSpan="5">No collectors are available to assign yet.</td></tr> : null}
          {!isLoading && collectors.map((collector) => {
            const selectedRoute = routes.find((route) => route._id === selections[collector._id]);
            const hasExistingAssignment = routes.some((route) => collectorId(route) === collector._id);

            return <tr key={collector._id}>
              <td><strong>{collector.name || 'Unnamed driver'}</strong><span className="route-stop-count">{collector.email || 'Collector'}</span></td>
              <td>
                <select
                  aria-label={`Assign a route to ${collector.name || 'this driver'}`}
                  onChange={(event) => setSelections((current) => ({ ...current, [collector._id]: event.target.value }))}
                  value={selections[collector._id] || ''}
                >
                  <option value="">Unassigned</option>
                  {[...routes].sort((left, right) => (left.name || '').localeCompare(right.name || '')).map((route) => <option key={route._id} value={route._id}>{routeLabel(route)}</option>)}
                </select>
              </td>
              <td>{selectedRoute ? routeArea(selectedRoute) : '—'}</td>
              <td>{selectedRoute ? routeSchedule(selectedRoute) : '—'}</td>
              <td><Button className="reassign-button" isDisabled={!selections[collector._id] || isSaving === collector._id} onPress={() => assignRoute(collector)} variant="secondary">{isSaving === collector._id ? 'Saving…' : hasExistingAssignment ? 'Update' : 'Assign'}</Button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </Card>;
}
