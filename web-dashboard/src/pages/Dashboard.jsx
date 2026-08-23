import { Button, Card, Chip, Input } from '@heroui/react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
import TruckManagementPanel from '../components/TruckManagementPanel.jsx';

const API_URL = import.meta.env.VITE_API_URL;

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'routes', label: 'Route History', icon: 'route' },
  { id: 'complaints', label: 'Complaints', icon: 'alert' },
  { id: 'activity', label: 'Staff Activity', icon: 'chart' },
  { id: 'assignments', label: 'Collector Assignments', icon: 'users' },
  { id: 'accounts', label: 'Manage Accounts', icon: 'account' },
  { id: 'trucks', label: 'Manage Trucks', icon: 'truck' },
];

const PLACEHOLDER_ACCOUNTS = [
  { id: 'collector-1', name: 'Roel Macaraeg', role: 'collector', area: 'Barangay Triangulo', contact: '09171234567', email: 'roel@nagacity.gov.ph' },
  { id: 'collector-2', name: 'Jun Bustillo', role: 'collector', area: 'Barangay Dayangdang', contact: '09182345678', email: 'jun@nagacity.gov.ph' },
  { id: 'staff-1', name: 'Maria Santos', role: 'staff', area: 'Barangay Concepcion Grande', contact: '09193456789', email: 'maria@nagacity.gov.ph' },
  { id: 'collector-3', name: 'Eddie Villanueva', role: 'collector', area: 'Barangay Concepcion Grande', contact: '09204567890', email: 'eddie@nagacity.gov.ph' },
];

const PLACEHOLDER_ROUTES = [
  { id: 'route-1', area: 'Barangay Triangulo', street: 'Peñafrancia Ave.', collector: 'Roel Macaraeg', date: '2025-06-28', status: 'collected', flagged: false },
  { id: 'route-2', area: 'Barangay Triangulo', street: 'Gen. Luna St.', collector: 'Roel Macaraeg', date: '2025-06-28', status: 'not collected', flagged: true },
  { id: 'route-3', area: 'Barangay Concepcion Grande', street: 'Burgos St.', collector: 'Eddie Villanueva', date: '2025-06-27', status: 'collected', flagged: false },
  { id: 'route-4', area: 'Barangay Dayangdang', street: 'Elias Angeles St.', collector: 'Jun Bustillo', date: '2025-06-27', status: 'not collected', flagged: true },
  { id: 'route-5', area: 'Barangay Bagumbayan Norte', street: 'Magsaysay Ave.', collector: 'Mario Reyes', date: '2025-06-26', status: 'collected', flagged: false },
];

const PLACEHOLDER_COMPLAINTS = [
  { id: 'complaint-1', street: 'Gen. Luna St., Triangulo', bags: 12, time: '6:42 AM', date: 'Jun 28, 2025', reporter: 'Maria Reyes', status: 'pending' },
  { id: 'complaint-2', street: 'Elias Angeles St., Dayangdang', bags: 7, time: '7:15 AM', date: 'Jun 28, 2025', reporter: 'Jose Dela Cruz', status: 'verified' },
  { id: 'complaint-3', street: 'Lerma St., Calaauag', bags: 3, time: '8:01 AM', date: 'Jun 27, 2025', reporter: 'Ana Villanueva', status: 'resolved' },
  { id: 'complaint-4', street: 'Burgos St., Concepcion Grande', bags: 9, time: '9:22 AM', date: 'Jun 27, 2025', reporter: 'Ramon Santos', status: 'pending' },
];

const PLACEHOLDER_ACTIVITY = [
  { id: 'activity-1', area: 'Barangay Triangulo', driver: 'Roel Macaraeg', length: '3.2', width: '2.1', height: '1.5', slope: '—', tonnage: '21.17 t', time: '06:45 AM' },
  { id: 'activity-2', area: 'Barangay Dayangdang', driver: 'Jun Bustillo', length: '2.8', width: '2.0', height: '1.3', slope: '—', tonnage: '17.12 t', time: '07:30 AM' },
  { id: 'activity-3', area: 'Barangay Concepcion Grande', driver: 'Eddie Villanueva', length: '3.5', width: '2.2', height: '1.6', slope: '—', tonnage: '26.57 t', time: '08:15 AM' },
];

const EMPTY_ACCOUNT = { name: '', contact: '', email: '', password: '', role: 'collector' };

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}

function titleCase(value = '') {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Pending';
}

function formatTonnes(value) {
  return `${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 1 })} t`;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildTonnageSeries(loads, days = 7) {
  const validLoads = (Array.isArray(loads) ? loads : []).filter((load) => !Number.isNaN(new Date(load.arrivedAt).getTime()));
  if (!validLoads.length) return [];

  const totalsByDay = new Map();
  let latestDate = startOfDay(new Date(validLoads[0].arrivedAt));
  validLoads.forEach((load) => {
    const day = startOfDay(new Date(load.arrivedAt));
    if (day > latestDate) latestDate = day;
    const key = dateKey(day);
    totalsByDay.set(key, (totalsByDay.get(key) || 0) + Number(load.tonnesEstimate || 0));
  });

  return Array.from({ length: days }, (_, index) => {
    const day = new Date(latestDate);
    day.setDate(latestDate.getDate() - (days - 1 - index));
    return { date: day, tonnes: totalsByDay.get(dateKey(day)) || 0 };
  });
}

function formatTrendRange(series) {
  if (!series.length) return 'No truckloads recorded yet';
  const first = series[0].date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const last = series.at(-1).date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
  return `${first} – ${last}`;
}

function Icon({ name, size = 18 }) {
  const paths = {
    grid: <><rect height="7" rx="1.5" width="7" x="3" y="3" /><rect height="7" rx="1.5" width="7" x="14" y="3" /><rect height="7" rx="1.5" width="7" x="3" y="14" /><rect height="7" rx="1.5" width="7" x="14" y="14" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3v-3a3 3 0 0 1 3-3h1" /></>,
    alert: <><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    chart: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    truck: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    image: <><rect height="16" rx="2" width="18" x="3" y="4" /><circle cx="8.5" cy="9" r="1.5" /><path d="m3 17 5-5 3 3 2-2 8 7" /></>,
  };
  return <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{paths[name] || paths.grid}</svg>;
}

function StatusChip({ status }) {
  const normalized = status.toLowerCase();
  const label = normalized === 'verified' ? 'Scheduled' : titleCase(normalized);
  return <Chip className={`status-chip status-${normalized.replace(' ', '-')}`} size="sm">{label}</Chip>;
}

function PanelTitle({ title, subtitle, action }) {
  return <div className="panel-title"><div><p className="eyebrow">Operations</p><h2>{title}</h2><p>{subtitle}</p></div>{action}</div>;
}

function MetricCard({ icon, label, value, caption, tone = 'green' }) {
  return <Card className="metric-card"><div className={`metric-icon metric-${tone}`}><Icon name={icon} size={20} /></div><div><p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-caption">{caption}</p></div></Card>;
}

function TonnageChart({ series }) {
  if (!series.length) {
    return <div className="chart-empty"><Icon name="chart" size={24} /><p>No submitted truckloads yet.</p><span>Daily tonnage will appear after staff record landfill loads.</span></div>;
  }

  const width = 760;
  const height = 255;
  const padding = { top: 24, right: 20, bottom: 45, left: 48 };
  const max = Math.max(...series.map((item) => item.tonnes), 1);
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const points = series.map((item, index) => ({ ...item, x: padding.left + (plotWidth / Math.max(series.length - 1, 1)) * index, y: padding.top + plotHeight - (item.tonnes / max) * plotHeight }));
  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `${padding.left},${padding.top + plotHeight} ${line} ${padding.left + plotWidth},${padding.top + plotHeight}`;

  return (
    <svg aria-label={`Daily tonnage trend from ${formatTrendRange(series)}`} className="tonnage-chart" role="img" viewBox={`0 0 ${width} ${height}`}>
      <defs><linearGradient id="tonnage-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#19a974" stopOpacity="0.22" /><stop offset="1" stopColor="#19a974" stopOpacity="0.01" /></linearGradient></defs>
      {[max, max / 2, 0].map((value) => {
        const y = padding.top + plotHeight - (value / max) * plotHeight;
        return <g key={value}><line className="chart-grid" x1={padding.left} x2={width - padding.right} y1={y} y2={y} /><text className="chart-axis" textAnchor="end" x={padding.left - 10} y={y + 4}>{formatTonnes(value)}</text></g>;
      })}
      <polygon fill="url(#tonnage-fill)" points={area} />
      <polyline fill="none" points={line} stroke="#07815f" strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
      {points.map((point) => <g key={dateKey(point.date)}><circle className="chart-dot" cx={point.x} cy={point.y} r="4.5"><title>{`${point.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}: ${formatTonnes(point.tonnes)}`}</title></circle><text className="chart-label" textAnchor="middle" x={point.x} y={height - 15}>{point.date.toLocaleDateString('en-PH', { weekday: 'short' })}</text></g>)}
    </svg>
  );
}

function AvatarName({ name }) {
  return <span className="avatar-name"><span className="table-avatar">{initials(name)}</span><span>{name}</span></span>;
}

function RoutePreview({ route }) {
  return <div className={`route-preview ${route.flagged ? 'flagged-route' : ''}`}><div><strong>{route.street}</strong>{route.flagged ? <span className="flag">Flagged</span> : null}<p>{route.area} · {route.collector}</p></div><span>{route.date}</span><StatusChip status={route.status} /></div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = sessionStorage.getItem('resiklean_admin_token');
  const storedUser = JSON.parse(sessionStorage.getItem('resiklean_admin_user') || '{}');
  const requestedPage = searchParams.get('view');
  const activePage = NAV_ITEMS.some((item) => item.id === requestedPage) ? requestedPage : 'overview';
  const [search, setSearch] = useState('');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [submissionState, setSubmissionState] = useState({ loading: false, message: '', error: '' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [apiData, setApiData] = useState({ users: null, routes: null, reports: null, loads: null, tonnage: null, compliance: null, usingPlaceholder: true });

  const refreshDashboard = useCallback(async () => {
    if (!API_URL || !token) return;
    setIsRefreshing(true);
    const headers = { Authorization: `Bearer ${token}` };
    try {
      const responses = await Promise.all([
        fetch(`${API_URL.replace(/\/$/, '')}/admin/users`, { headers }),
        fetch(`${API_URL.replace(/\/$/, '')}/admin/routes`, { headers }),
        fetch(`${API_URL.replace(/\/$/, '')}/admin/reports`, { headers }),
        fetch(`${API_URL.replace(/\/$/, '')}/admin/tonnage`, { headers }),
        fetch(`${API_URL.replace(/\/$/, '')}/admin/compliance`, { headers }),
      ]);
      if (responses.some((response) => !response.ok)) throw new Error('One or more dashboard resources are unavailable.');
      const results = await Promise.all(responses.map((response) => response.json()));
      if (results.some((result) => !result.success)) throw new Error('The admin API returned incomplete data.');
      setApiData({
        users: results[0].data?.users || [],
        routes: results[1].data?.routes || [],
        reports: results[2].data?.reports || [],
        loads: results[3].data?.loads || [],
        tonnage: results[3].data || null,
        compliance: results[4].data?.report || [],
        usingPlaceholder: false,
      });
    } catch {
      setApiData((current) => ({ ...current, usingPlaceholder: true }));
    } finally {
      setIsRefreshing(false);
    }
  }, [token]);

  useEffect(() => { void refreshDashboard(); }, [refreshDashboard]);

  const accountRows = useMemo(() => {
    if (!apiData.users?.length) return [...createdAccounts, ...PLACEHOLDER_ACCOUNTS];
    return [...createdAccounts, ...apiData.users.filter((user) => ['collector', 'staff'].includes(user.role)).map((user) => ({ id: user._id, name: user.name, role: user.role, area: user.barangay || 'Not assigned', contact: user.contact || '—', email: user.email }))];
  }, [apiData.users, createdAccounts]);

  const routeRows = useMemo(() => {
    if (!apiData.routes?.length) return PLACEHOLDER_ROUTES;
    return apiData.routes.map((route) => ({ id: route._id, area: route.barangay || 'Not assigned', street: route.name || 'Unnamed route', collector: route.collectorId?.name || 'Unassigned', date: 'Current schedule', status: route.isActive === false ? 'not collected' : 'collected', flagged: false }));
  }, [apiData.routes]);

  const complaintRows = useMemo(() => {
    if (!apiData.reports?.length) return PLACEHOLDER_COMPLAINTS;
    return apiData.reports.map((report) => ({ id: report._id, street: report.description || `${report.barangay || 'Unassigned area'} report`, bags: report.aiVerified ? Math.max(1, Math.round((report.aiConfidence || 0.5) * 12)) : '—', time: new Date(report.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), date: new Date(report.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), reporter: report.residentId?.name || 'Resident', status: report.status || 'pending' }));
  }, [apiData.reports]);

  const activityRows = useMemo(() => {
    if (!apiData.loads?.length) return PLACEHOLDER_ACTIVITY;
    return apiData.loads.map((load) => ({ id: load._id, area: load.routeId?.barangay || 'Unassigned area', driver: load.staffId?.name || 'Staff member', truckPlate: load.truckPlate || 'Unknown truck', length: load.length ? (load.length / 100).toFixed(1) : '—', width: load.width ? (load.width / 100).toFixed(1) : '—', height: load.height ? (load.height / 100).toFixed(1) : '—', slope: `${Number(load.slope || 0).toFixed(1)} m³`, tonnage: formatTonnes(load.tonnesEstimate), time: new Date(load.arrivedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), date: load.arrivedAt ? new Date(load.arrivedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable', photoUrl: load.photoUrl || '', notes: load.notes || '' }));
  }, [apiData.loads]);

  const filteredAccounts = accountRows.filter((account) => `${account.name} ${account.email} ${account.area}`.toLowerCase().includes(search.toLowerCase()));
  const filteredRoutes = routeRows.filter((route) => `${route.area} ${route.street} ${route.collector}`.toLowerCase().includes(search.toLowerCase()));
  const tonnageSeries = useMemo(() => apiData.usingPlaceholder ? [] : buildTonnageSeries(apiData.loads), [apiData.loads, apiData.usingPlaceholder]);
  const totalTonnage = apiData.tonnage?.totalTonnesEstimate;
  const totalLoads = apiData.tonnage?.count || 0;
  const completionRate = useMemo(() => {
    if (!apiData.compliance?.length) return null;
    const totalStops = apiData.compliance.reduce((sum, row) => sum + (row.totalStops || 0), 0);
    const collectedStops = apiData.compliance.reduce((sum, row) => sum + (row.collected || 0), 0);
    return totalStops ? `${((collectedStops / totalStops) * 100).toFixed(1)}%` : null;
  }, [apiData.compliance]);

  const signOut = () => {
    sessionStorage.removeItem('resiklean_admin_token');
    sessionStorage.removeItem('resiklean_admin_user');
    navigate('/login', { replace: true });
  };

  const selectPage = (page) => {
    setSearchParams(page === 'overview' ? {} : { view: page });
  };

  const updateComplaintStatus = (id, status) => {
    setSubmissionState({ loading: false, error: '', message: `Complaint status set to ${titleCase(status)} locally.` });
    setApiData((current) => ({ ...current, reports: current.reports?.map((report) => report._id === id ? { ...report, status } : report) || current.reports }));
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setSubmissionState({ loading: true, error: '', message: '' });
    const localAccount = { id: `local-${Date.now()}`, name: newAccount.name, role: newAccount.role, area: 'Not assigned', contact: newAccount.contact || '—', email: newAccount.email };
    try {
      if (API_URL && token) {
        const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/users`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newAccount.name, email: newAccount.email, password: newAccount.password, role: newAccount.role }) });
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to create the account.');
        setCreatedAccounts((current) => [{ ...localAccount, id: result.data?._id || localAccount.id }, ...current]);
        setSubmissionState({ loading: false, error: '', message: 'Account created. Contact and area remain dashboard-only until backend support is added.' });
      } else {
        setCreatedAccounts((current) => [localAccount, ...current]);
        setSubmissionState({ loading: false, error: '', message: 'Account added as placeholder data. Configure VITE_API_URL to create it in the backend.' });
      }
      setNewAccount(EMPTY_ACCOUNT);
      setShowAccountForm(false);
    } catch (error) {
      setSubmissionState({ loading: false, message: '', error: error instanceof Error ? error.message : 'Unable to create the account.' });
    }
  };

  if (!token) return <Navigate replace to="/login" />;

  const overview = <>
    <div className="overview-intro"><div><p className="eyebrow">Operational snapshot</p><h2>Collection at a glance</h2><p>Live information from SWMO collection and landfill activity.</p></div><Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary"><Icon name="refresh" size={16} />{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button></div>
    <div className="metrics-grid">
      <MetricCard caption={completionRate ? 'Across today’s active routes' : 'Live route data unavailable'} icon="route" label="Collection completion" value={completionRate || '—'} />
      <MetricCard caption={apiData.usingPlaceholder ? 'Connect the admin API to view totals' : `${totalLoads} submitted truckload${totalLoads === 1 ? '' : 's'}`} icon="truck" label="Recorded tonnage" tone="teal" value={apiData.usingPlaceholder ? '—' : formatTonnes(totalTonnage)} />
      <MetricCard caption="Reports awaiting review" icon="alert" label="Pending complaints" tone="amber" value={String(complaintRows.filter((item) => item.status === 'pending').length)} />
    </div>
    <Card className="chart-card">
      <div className="card-heading-row"><div><p className="eyebrow">Landfill activity</p><h3>Tonnage trend</h3><p>{formatTrendRange(tonnageSeries)} · totals are calculated from submitted truckloads</p></div><Chip className="live-chip" size="sm">{apiData.usingPlaceholder ? 'Waiting for API' : 'Live data'}</Chip></div>
      <TonnageChart series={tonnageSeries} />
    </Card>
    <Card className="overview-routes"><div className="card-heading-row overview-route-heading"><div><p className="eyebrow">Collection tracking</p><h3>Recent route activity</h3><p>Street-level collection status</p></div><button className="text-button" onClick={() => selectPage('routes')}>View route history <Icon name="arrow" size={15} /></button></div>{routeRows.slice(0, 4).map((route) => <RoutePreview key={route.id} route={route} />)}<button className="view-more" onClick={() => selectPage('routes')}>View all {routeRows.length} entries <Icon name="arrow" size={15} /></button></Card>
  </>;

  const routeHistory = <><PanelTitle action={<Button className="outline-button" variant="secondary">Export</Button>} subtitle="Street-level collection tracking by collector" title="Route history" /><Card className="table-card"><div className="filter-row"><select aria-label="Filter by collector" defaultValue="all"><option value="all">All collectors</option>{accountRows.filter((account) => account.role === 'collector').map((account) => <option key={account.id}>{account.name}</option>)}</select><select aria-label="Filter by area" defaultValue="all"><option value="all">All areas</option>{[...new Set(routeRows.map((route) => route.area))].map((area) => <option key={area}>{area}</option>)}</select><input aria-label="Filter by date" type="date" /><span className="entries-count">{filteredRoutes.length} entries</span></div><div className="table-scroll"><table><thead><tr><th>Area</th><th>Date</th><th>Street</th><th>Collector</th><th>Status</th></tr></thead><tbody>{filteredRoutes.map((route) => <tr key={route.id}><td>{route.area}{route.flagged ? <span className="flag">Flagged</span> : null}</td><td>{route.date}</td><td>{route.street}</td><td><AvatarName name={route.collector} /></td><td><StatusChip status={route.status} /></td></tr>)}</tbody></table></div></Card></>;

  const complaints = <><PanelTitle action={<Chip className="pending-count" size="sm">{complaintRows.filter((complaint) => complaint.status === 'pending').length} pending</Chip>} subtitle="Resident-submitted missed collection reports" title="Complaint queue" /><div className="complaint-list">{complaintRows.map((complaint) => <Card className="complaint-card" key={complaint.id}><div className="complaint-art"><Icon name="alert" size={24} /></div><div className="complaint-main"><h3>{complaint.street}</h3><p>{complaint.bags} bags detected · {complaint.time}</p></div><div className="complaint-meta"><span>Date</span><strong>{complaint.date}</strong></div><div className="complaint-meta"><span>Reported by</span><strong>{complaint.reporter}</strong></div><select aria-label={`Update ${complaint.street} status`} className={`complaint-status status-${complaint.status}`} onChange={(event) => updateComplaintStatus(complaint.id, event.target.value)} value={complaint.status}><option value="pending">Pending</option><option value="verified">Scheduled</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option></select></Card>)}</div></>;

  const activity = <Card className="table-card staff-activity-card"><div className="card-heading-row"><div><p className="eyebrow">Landfill operations</p><h3>Staff activity log</h3><p>{apiData.usingPlaceholder ? 'Sample activity while the admin API is unavailable' : `${totalLoads} recorded truckload${totalLoads === 1 ? '' : 's'}`} · click a submission to view its audit photo</p></div><Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary">{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button></div><div className="table-scroll"><table><thead><tr><th>Area</th><th>Driver</th><th>L (m)</th><th>W (m)</th><th>H (m)</th><th>Slope</th><th>Tonnage</th><th>Time</th></tr></thead><tbody>{activityRows.map((row) => <tr aria-label={`View truckload from ${row.area}`} className="activity-row" key={row.id} onClick={() => row.photoUrl || row.notes ? setSelectedActivity(row) : null} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && (row.photoUrl || row.notes)) { event.preventDefault(); setSelectedActivity(row); } }} tabIndex={row.photoUrl || row.notes ? 0 : undefined}><td>{row.area}</td><td><strong>{row.driver}</strong></td><td>{row.length}</td><td>{row.width}</td><td>{row.height}</td><td>{row.slope}</td><td className="tonnage-cell">{row.tonnage}</td><td>{row.time}</td></tr>)}</tbody></table></div></Card>;

  const assignments = <><PanelTitle action={<Chip className="active-count" size="sm">{routeRows.filter((route) => route.collector !== 'Unassigned').length} assigned</Chip>} subtitle="Manage collectors assigned to SWMO areas" title="Collector assignments" /><Card className="table-card"><div className="table-scroll"><table><thead><tr><th>Collector</th><th>Currently assigned area</th><th>Last updated</th><th>Action</th></tr></thead><tbody>{routeRows.slice(0, 5).map((route) => <tr key={route.id}><td><AvatarName name={route.collector} /></td><td>{route.area}</td><td>Current schedule</td><td><Button className="reassign-button" variant="secondary">Reassign</Button></td></tr>)}</tbody></table></div></Card></>;

  const accounts = <><PanelTitle action={<Button className="primary-button" onPress={() => { setSubmissionState({ loading: false, error: '', message: '' }); setShowAccountForm(true); }}><Icon name="plus" size={16} />Add account</Button>} subtitle="Manage collector and staff accounts" title="Account management" />{submissionState.message ? <p className="feedback success-feedback">{submissionState.message}</p> : null}{submissionState.error ? <p className="feedback error-feedback">{submissionState.error}</p> : null}<Card className="table-card"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Assigned area</th><th>Contact</th><th>Email</th></tr></thead><tbody>{filteredAccounts.map((account) => <tr key={account.id}><td><AvatarName name={account.name} /></td><td><Chip className={`role-chip role-${account.role}`} size="sm">{titleCase(account.role)}</Chip></td><td>{account.area}</td><td>{account.contact}</td><td>{account.email}</td></tr>)}</tbody></table></div></Card></>;

  const trucks = <><PanelTitle subtitle="Register fleet vehicles and review their dimensions" title="Truck management" /><TruckManagementPanel token={token} /></>;

  const pageContent = { overview, routes: routeHistory, complaints, activity, assignments, accounts, trucks }[activePage];
  const activeLabel = NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Overview';

  return <main className="admin-shell"><aside className="admin-sidebar"><div className="brand"><div className="brand-mark">R</div><div><strong>ResiKlean</strong><span>SWMO administrator</span></div></div><nav>{NAV_ITEMS.map((item) => <button aria-current={activePage === item.id ? 'page' : undefined} className={activePage === item.id ? 'nav-link active' : 'nav-link'} key={item.id} onClick={() => selectPage(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav><button className="signout-button" onClick={signOut}><Icon name="logout" />Sign out</button></aside><section className="admin-workspace"><header className="topbar"><div><p className="eyebrow">Naga City SWMO</p><h1>{activeLabel}</h1></div><div className="topbar-actions"><Input aria-label="Search dashboard" className="search-input" onChange={(event) => setSearch(event.target.value)} placeholder="Search accounts or routes" startContent={<Icon name="search" size={16} />} value={search} /><button aria-label="Notifications" className="notification-button"><Icon name="bell" size={19} /><i /></button><div className="topbar-avatar">{initials(storedUser.name || 'Admin')}</div><strong className="admin-name">{storedUser.name || 'Admin'}</strong></div></header><section className="dashboard-content">{apiData.usingPlaceholder ? <p className="data-note">Live dashboard data is unavailable. Sample records are shown for the tables; the tonnage chart intentionally stays empty.</p> : null}{pageContent}</section></section>{showAccountForm ? <div className="modal-layer" role="presentation"><div aria-modal="true" className="account-modal" role="dialog"><form onSubmit={createAccount}><div className="modal-header"><div><p className="eyebrow">Account management</p><h2>Add new account</h2></div><button aria-label="Close account form" onClick={() => setShowAccountForm(false)} type="button">×</button></div><div className="modal-body"><label>Full name<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Juan dela Cruz" required value={newAccount.name} /></label><label>Contact number<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, contact: event.target.value }))} placeholder="09XXXXXXXXX" value={newAccount.contact} /></label><label>Email address<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, email: event.target.value }))} placeholder="user@nagacity.gov.ph" required type="email" value={newAccount.email} /></label><label>Temporary password<Input fullWidth minLength="6" onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} placeholder="At least 6 characters" required type="password" value={newAccount.password} /></label><label>Role<select onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value }))} value={newAccount.role}><option value="collector">Collector</option><option value="staff">Staff</option></select></label><p className="field-note">Contact number is dashboard-only until the backend stores it.</p>{submissionState.error ? <p className="feedback error-feedback">{submissionState.error}</p> : null}</div><div className="modal-footer"><Button className="outline-button" onPress={() => setShowAccountForm(false)} type="button" variant="secondary">Cancel</Button><Button className="primary-button" isDisabled={submissionState.loading} type="submit">{submissionState.loading ? 'Creating…' : 'Create account'}</Button></div></form></div></div> : null}{selectedActivity ? <div className="modal-layer" onClick={() => setSelectedActivity(null)} role="presentation"><div aria-modal="true" className="activity-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Landfill operations</p><h2>Truckload submission</h2></div><button aria-label="Close truckload details" onClick={() => setSelectedActivity(null)} type="button">×</button></div><div className="activity-detail-body">{selectedActivity.photoUrl ? <img alt={`Audit photo for ${selectedActivity.area}`} className="activity-detail-photo" src={selectedActivity.photoUrl} /> : <div className="activity-photo-empty"><Icon name="image" size={28} /><p>No audit photo available</p></div>}<div className="activity-detail-grid"><div><span>Area</span><strong>{selectedActivity.area}</strong></div><div><span>Staff</span><strong>{selectedActivity.driver}</strong></div><div><span>Truck</span><strong>{selectedActivity.truckPlate}</strong></div><div><span>Submitted</span><strong>{selectedActivity.date} · {selectedActivity.time}</strong></div><div><span>Measurements</span><strong>{selectedActivity.length} m × {selectedActivity.width} m × {selectedActivity.height} m</strong></div><div><span>Slope</span><strong>{selectedActivity.slope}</strong></div><div><span>Estimated tonnage</span><strong className="tonnage-cell">{selectedActivity.tonnage}</strong></div></div>{selectedActivity.notes ? <div className="activity-detail-notes"><span>Notes</span><p>{selectedActivity.notes}</p></div> : null}</div><div className="modal-footer"><Button className="outline-button" onPress={() => setSelectedActivity(null)} type="button" variant="secondary">Close</Button></div></div></div> : null}</main>;
}
