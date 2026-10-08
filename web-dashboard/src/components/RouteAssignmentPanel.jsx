import { Button, Card } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from './AppSelect.jsx';

const API_URL = import.meta.env.VITE_API_URL;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function collectorId(route) { return typeof route.collectorId === 'object' ? route.collectorId?._id : route.collectorId; }
function cycleDriverId(cycle) { return typeof cycle.driverId === 'object' ? cycle.driverId?._id : cycle.driverId; }
function cycleTruckId(cycle) { return typeof cycle.truckId === 'object' ? cycle.truckId?._id : cycle.truckId; }
function routeLabel(route) {
  const fullName = String(route?.name || route?.routeName || route?.area || '');
  const match = fullName.match(/\barea\s+(\d+[a-z]?)\b/i);
  return match ? `Area ${match[1].toUpperCase()}` : route?.name || 'Unnamed route';
}
function routeArea(route) { return Array.isArray(route?.barangay) ? route.barangay.filter(Boolean).join(', ') || 'No area set' : route?.barangay || 'No area set'; }
function routeSchedule(route) {
  if (!Array.isArray(route?.schedule) || !route.schedule.length) return 'No schedule set';
  return [...route.schedule].sort((left, right) => left - right).map((day) => DAYS[day] || day).join(', ');
}
function truckLabel(truck) {
  return `${truck.truckNumber || 'Unnumbered truck'} · ${truck.plateNumber || 'No plate'}${truck.availability === 'unavailable' ? ' · Unavailable' : ''}`;
}

export default function RouteAssignmentPanel({ token }) {
  const apiBase = API_URL?.replace(/\/$/, '');
  const [routes, setRoutes] = useState([]);
  const [collectors, setCollectors] = useState([]);
  const [trucks, setTrucks] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [routeSelections, setRouteSelections] = useState({});
  const [truckSelections, setTruckSelections] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadAssignments = useCallback(async () => {
    if (!apiBase || !token) {
      setError(!apiBase ? 'VITE_API_URL is not configured.' : 'Sign in as an administrator to manage assignments.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError('');
    try {
      const headers = { Authorization: `Bearer ${token}` };
      const [routesResponse, usersResponse, trucksResponse, cyclesResponse] = await Promise.all([
        fetch(`${apiBase}/admin/routes`, { headers }),
        fetch(`${apiBase}/admin/users`, { headers }),
        fetch(`${apiBase}/trucks`, { headers }),
        fetch(`${apiBase}/admin/cycle-logs?status=active`, { headers }),
      ]);
      const [routesResult, usersResult, trucksResult, cyclesResult] = await Promise.all([
        routesResponse.json(), usersResponse.json(), trucksResponse.json(), cyclesResponse.json(),
      ]);
      if (!routesResponse.ok || !routesResult.success) throw new Error(routesResult.error || 'Unable to load routes.');
      if (!usersResponse.ok || !usersResult.success) throw new Error(usersResult.error || 'Unable to load collectors.');
      if (!trucksResponse.ok || !trucksResult.success) throw new Error(trucksResult.error || 'Unable to load registered trucks.');
      if (!cyclesResponse.ok || !cyclesResult.success) throw new Error(cyclesResult.error || 'Unable to load truck assignments.');

      const nextRoutes = routesResult.data?.routes || [];
      const nextCollectors = (usersResult.data?.users || []).filter((user) => user.role === 'collector').sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const nextTrucks = (trucksResult.data?.trucks || []).filter((truck) => truck.isActive !== false).sort((a, b) => truckLabel(a).localeCompare(truckLabel(b), undefined, { numeric: true, sensitivity: 'base' }));
      const nextCycles = cyclesResult.data?.logs || [];
      setRoutes(nextRoutes);
      setCollectors(nextCollectors);
      setTrucks(nextTrucks);
      setCycles(nextCycles);
      setRouteSelections(Object.fromEntries(nextCollectors.map((collector) => [collector._id, nextRoutes.find((route) => collectorId(route) === collector._id)?._id || ''])));
      setTruckSelections(Object.fromEntries(nextCollectors.map((collector) => [collector._id, cycleTruckId(nextCycles.find((cycle) => cycleDriverId(cycle) === collector._id) || {}) || ''])));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to load assignments.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { void loadAssignments(); }, [loadAssignments]);

  const assignedCount = useMemo(() => collectors.filter((collector) => (
    routes.some((route) => collectorId(route) === collector._id) || cycles.some((cycle) => cycleDriverId(cycle) === collector._id)
  )).length, [collectors, cycles, routes]);

  const saveAssignments = async (collector) => {
    const nextRouteId = routeSelections[collector._id];
    const nextTruckId = truckSelections[collector._id];
    if (!apiBase || (!nextRouteId && !nextTruckId)) return;
    setError('');
    setSuccess('');
    setIsSaving(collector._id);
    try {
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const messages = [];
      if (nextRouteId) {
        const response = await fetch(`${apiBase}/admin/routes/${encodeURIComponent(nextRouteId)}/assign`, { body: JSON.stringify({ collectorId: collector._id }), headers, method: 'PATCH' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to assign this route.');
        setRoutes((current) => current.map((route) => route._id === nextRouteId ? result.data : route));
        messages.push(`${result.data.name || 'Route'} assigned`);
      }
      if (nextTruckId) {
        const response = await fetch(`${apiBase}/admin/cycle-logs`, { body: JSON.stringify({ driverId: collector._id, truckId: nextTruckId }), headers, method: 'POST' });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to assign this truck.');
        setCycles((current) => [...current.filter((cycle) => cycleDriverId(cycle) !== collector._id), result.data]);
        messages.push(`${result.data.truckId?.truckNumber || 'Truck'} assigned`);
      }
      setSuccess(`${messages.join(' and ')} to ${collector.name || 'the driver'}.`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'Unable to save assignments.');
    } finally {
      setIsSaving('');
    }
  };

  return <Card className="route-assignment-card">
    <div className="route-assignment-toolbar"><p>{isLoading ? 'Loading routes, drivers, and trucks...' : `${assignedCount} of ${collectors.length} drivers assigned`}</p></div>
    {success ? <p className="feedback success-feedback" role="status">{success}</p> : null}
    {error ? <p className="feedback error-feedback" role="alert">{error}</p> : null}
    <div className="table-scroll">
      <table className="standard-data-table route-assignment-table">
        <thead><tr><th>Driver</th><th>Assigned route</th><th>Assign truck</th><th>Schedule</th><th>Action</th></tr></thead>
        <tbody>
          {isLoading ? <tr><td className="route-assignment-message" colSpan="5">Loading current assignments...</td></tr> : null}
          {!isLoading && !error && collectors.length === 0 ? <tr><td className="route-assignment-message" colSpan="5">No collectors are available to assign yet.</td></tr> : null}
          {!isLoading && collectors.map((collector) => {
            const selectedRoute = routes.find((route) => route._id === routeSelections[collector._id]);
            const assignedCycle = cycles.find((cycle) => cycleDriverId(cycle) === collector._id);
            const hasExistingAssignment = Boolean(selectedRoute || assignedCycle);
            return <tr key={collector._id}>
              <td><strong>{collector.name || 'Unnamed driver'}</strong><span className="route-stop-count">{collector.email || 'Collector'}</span></td>
              <td><AppSelect aria-label={`Assign a route to ${collector.name || 'this driver'}`} className="route-assignment-select" onChange={(routeId) => setRouteSelections((current) => ({ ...current, [collector._id]: routeId === 'unassigned' ? '' : routeId }))} options={[{ label: 'Unassigned', value: 'unassigned' }, ...[...routes].sort((a, b) => routeLabel(a).localeCompare(routeLabel(b), undefined, { numeric: true, sensitivity: 'base' })).map((route) => ({ label: routeLabel(route), value: route._id }))]} value={routeSelections[collector._id] || 'unassigned'} /></td>
              <td><AppSelect aria-label={`Assign a truck to ${collector.name || 'this driver'}`} className="route-assignment-select" onChange={(truckId) => setTruckSelections((current) => ({ ...current, [collector._id]: truckId === 'unassigned' ? '' : truckId }))} options={[{ label: 'Unassigned', value: 'unassigned' }, ...trucks.map((truck) => ({ label: truckLabel(truck), value: truck._id }))]} value={truckSelections[collector._id] || 'unassigned'} /></td>
              <td>{selectedRoute ? routeSchedule(selectedRoute) : '—'}</td>
              <td><Button className="reassign-button" isDisabled={(!routeSelections[collector._id] && !truckSelections[collector._id]) || isSaving === collector._id} onPress={() => saveAssignments(collector)} variant="secondary">{isSaving === collector._id ? 'Saving...' : hasExistingAssignment ? 'Update' : 'Assign'}</Button></td>
            </tr>;
          })}
        </tbody>
      </table>
    </div>
  </Card>;
}
