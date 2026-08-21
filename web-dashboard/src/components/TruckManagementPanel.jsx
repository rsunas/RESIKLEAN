import { Button, Card, Input } from '@heroui/react';
import { useCallback, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const EMPTY_TRUCK = { plateNumber: '', length: '', width: '', height: '' };

export default function TruckManagementPanel({ token }) {
  const apiBase = API_URL?.replace(/\/$/, '');
  const [truck, setTruck] = useState(EMPTY_TRUCK);
  const [trucks, setTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [submission, setSubmission] = useState({ loading: false, message: '', error: '' });

  const loadTrucks = useCallback(async () => {
    if (!apiBase || !token) {
      setIsLoading(false);
      setListError(!apiBase ? 'VITE_API_URL is not configured.' : 'Sign in as an administrator to view trucks.');
      return;
    }

    setIsLoading(true);
    setListError('');
    try {
      const response = await fetch(`${apiBase}/trucks`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load trucks.');
      setTrucks(result.data?.trucks || []);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to load trucks.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { void loadTrucks(); }, [loadTrucks]);

  const updateTruck = (field, value) => setTruck((current) => ({ ...current, [field]: value }));

  const createTruck = async (event) => {
    event.preventDefault();
    if (!apiBase) {
      setSubmission({ loading: false, message: '', error: 'VITE_API_URL is not configured.' });
      return;
    }

    setSubmission({ loading: true, message: '', error: '' });
    try {
      const response = await fetch(`${apiBase}/admin/trucks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ plateNumber: truck.plateNumber, length: Number(truck.length), width: Number(truck.width), height: Number(truck.height) }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to register the truck.');

      setTrucks((current) => [...current, result.data].sort((left, right) => left.plateNumber.localeCompare(right.plateNumber)));
      setTruck(EMPTY_TRUCK);
      setSubmission({ loading: false, message: `${result.data.plateNumber} has been registered.`, error: '' });
    } catch (error) {
      setSubmission({ loading: false, message: '', error: error instanceof Error ? error.message : 'Unable to register the truck.' });
    }
  };

  return <>
    <div className="truck-management-grid">
      <form className="truck-form-card" onSubmit={createTruck}>
        <div><p className="eyebrow">Fleet registry</p><h2>Register a truck</h2><p>Dimensions are stored in centimetres and used when staff log landfill loads.</p></div>
        <label htmlFor="plateNumber">Plate number<Input autoCapitalize="characters" id="plateNumber" onChange={(event) => updateTruck('plateNumber', event.target.value)} placeholder="ABC-1234" required value={truck.plateNumber} /></label>
        <div className="truck-form-grid">
          <label htmlFor="length">Length (cm)<Input id="length" min="0" onChange={(event) => updateTruck('length', event.target.value)} required step="any" type="number" value={truck.length} /></label>
          <label htmlFor="width">Width (cm)<Input id="width" min="0" onChange={(event) => updateTruck('width', event.target.value)} required step="any" type="number" value={truck.width} /></label>
          <label htmlFor="height">Height (cm)<Input id="height" min="0" onChange={(event) => updateTruck('height', event.target.value)} required step="any" type="number" value={truck.height} /></label>
        </div>
        {submission.message ? <p className="feedback success-feedback" role="status">{submission.message}</p> : null}
        {submission.error ? <p className="feedback error-feedback" role="alert">{submission.error}</p> : null}
        <Button className="primary-button" isDisabled={submission.loading} type="submit">{submission.loading ? 'Registering…' : 'Register truck'}</Button>
      </form>

      <Card aria-labelledby="registered-trucks-title" className="truck-list-card">
        <div className="truck-list-heading"><div><p className="eyebrow">Current fleet</p><h2 id="registered-trucks-title">Registered trucks</h2><p>{isLoading ? 'Loading fleet…' : `${trucks.length} truck${trucks.length === 1 ? '' : 's'} in the fleet`}</p></div><Button className="outline-button" isDisabled={isLoading} onPress={loadTrucks} variant="secondary">Refresh</Button></div>
        {listError ? <p className="feedback error-feedback" role="alert">{listError}</p> : null}
        {!isLoading && !listError && trucks.length === 0 ? <p className="truck-empty-state">No trucks have been registered yet.</p> : null}
        {!isLoading && trucks.length > 0 ? <ul className="truck-list">{trucks.map((existingTruck) => <li key={existingTruck._id}><strong>{existingTruck.plateNumber}</strong><span>L × W × H: {existingTruck.length} × {existingTruck.width} × {existingTruck.height} cm</span></li>)}</ul> : null}
      </Card>
    </div>
  </>;
}
