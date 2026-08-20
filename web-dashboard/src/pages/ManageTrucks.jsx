import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;
const EMPTY_TRUCK = { plateNumber: '', length: '', width: '', height: '' };
const ADMIN_NAV_ITEMS = [
  { label: 'Overview', icon: '▦' },
  { label: 'Route History', icon: '⚑' },
  { label: 'Complaints', icon: '!' },
  { label: 'Staff Activity', icon: '⌁' },
  { label: 'Collector Assignments', icon: '⌖' },
  { label: 'Manage Accounts', icon: '♧' },
];

function getApiBase() {
  return API_URL?.replace(/\/$/, '');
}

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}

export default function ManageTrucks() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('resiklean_admin_token');
  const storedUser = JSON.parse(sessionStorage.getItem('resiklean_admin_user') || '{}');
  const apiBase = getApiBase();
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
      const response = await fetch(`${apiBase}/trucks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load trucks.');
      setTrucks(result.data?.trucks || []);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to load trucks.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => {
    loadTrucks();
  }, [loadTrucks]);

  const updateTruck = (field, value) => {
    setTruck((current) => ({ ...current, [field]: value }));
  };

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
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plateNumber: truck.plateNumber,
          length: Number(truck.length),
          width: Number(truck.width),
          height: Number(truck.height),
        }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to register the truck.');

      setTrucks((current) => [...current, result.data].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber)));
      setTruck(EMPTY_TRUCK);
      setSubmission({ loading: false, message: `${result.data.plateNumber} has been registered.`, error: '' });
    } catch (error) {
      setSubmission({ loading: false, message: '', error: error instanceof Error ? error.message : 'Unable to register the truck.' });
    }
  };

  const signOut = () => {
    sessionStorage.removeItem('resiklean_admin_token');
    sessionStorage.removeItem('resiklean_admin_user');
    navigate('/login', { replace: true });
  };

  if (!token) return <Navigate replace to="/login" />;

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand"><strong>SWMO</strong><span>Administrator</span></div>
        <nav>
          {ADMIN_NAV_ITEMS.map((item) => <Link className="nav-link" key={item.label} to="/dashboard"><span>{item.icon}</span>{item.label}</Link>)}
          <Link aria-current="page" className="nav-link active manage-trucks-link" to="/manage-trucks"><span>▣</span>Manage Trucks</Link>
        </nav>
        <button className="signout-button" onClick={signOut}>⇥&nbsp; Sign Out</button>
      </aside>
      <section className="admin-workspace">
        <header className="topbar">
          <div><h1>Manage Trucks</h1><p>Naga City Solid Waste Management Office</p></div>
          <div className="topbar-actions"><div className="topbar-avatar">{initials(storedUser.name || 'Admin')}</div><strong className="admin-name">{storedUser.name || 'Admin'}</strong></div>
        </header>
        <section className="dashboard-content">
          <section className="truck-management-page">
      <header className="truck-management-header">
        <div>
          <p className="eyebrow">SWMO Administrator</p>
          <h1>Manage Trucks</h1>
          <p>Register fleet vehicles and review their recorded dimensions.</p>
        </div>
      </header>

      <section className="truck-management-grid">
        <form className="truck-form-card" onSubmit={createTruck}>
          <div>
            <h2>Register a truck</h2>
            <p>All dimensions are recorded using the fleet registry’s existing units.</p>
          </div>

          <label htmlFor="plateNumber">Plate Number
            <input autoCapitalize="characters" id="plateNumber" onChange={(event) => updateTruck('plateNumber', event.target.value)} placeholder="ABC-1234" required value={truck.plateNumber} />
          </label>
          <div className="truck-form-grid">
            <label htmlFor="length">Length
              <input id="length" min="0" onChange={(event) => updateTruck('length', event.target.value)} required step="any" type="number" value={truck.length} />
            </label>
            <label htmlFor="width">Width
              <input id="width" min="0" onChange={(event) => updateTruck('width', event.target.value)} required step="any" type="number" value={truck.width} />
            </label>
            <label htmlFor="height">Height
              <input id="height" min="0" onChange={(event) => updateTruck('height', event.target.value)} required step="any" type="number" value={truck.height} />
            </label>
          </div>
          {submission.message ? <p className="feedback success-feedback" role="status">{submission.message}</p> : null}
          {submission.error ? <p className="feedback error-feedback" role="alert">{submission.error}</p> : null}
          <button className="truck-submit" disabled={submission.loading} type="submit">{submission.loading ? 'Registering…' : 'Register Truck'}</button>
        </form>

        <section aria-labelledby="registered-trucks-title" className="truck-list-card">
          <div className="truck-list-heading">
            <div>
              <h2 id="registered-trucks-title">Registered trucks</h2>
              <p>{isLoading ? 'Loading fleet…' : `${trucks.length} truck${trucks.length === 1 ? '' : 's'} in the fleet`}</p>
            </div>
            <button className="outline-button" disabled={isLoading} onClick={loadTrucks} type="button">Refresh</button>
          </div>

          {listError ? <p className="feedback error-feedback" role="alert">{listError}</p> : null}
          {!isLoading && !listError && trucks.length === 0 ? <p className="truck-empty-state">No trucks have been registered yet.</p> : null}
          {!isLoading && trucks.length > 0 ? <ul className="truck-list">
            {trucks.map((existingTruck) => <li key={existingTruck._id}>
              <strong>{existingTruck.plateNumber}</strong>
              <span>L × W × H: {existingTruck.length} × {existingTruck.width} × {existingTruck.height}</span>
            </li>)}
          </ul> : null}
        </section>
      </section>
          </section>
        </section>
      </section>
    </main>
  );
}
