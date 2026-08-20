import { Button, Card, Chip, Input } from '@heroui/react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useEffect, useMemo, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL;

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: '▦' },
  { id: 'routes', label: 'Route History', icon: '⚑' },
  { id: 'complaints', label: 'Complaints', icon: '!' },
  { id: 'activity', label: 'Staff Activity', icon: '⌁' },
  { id: 'assignments', label: 'Collector Assignments', icon: '⌖' },
  { id: 'accounts', label: 'Accounts', icon: '♧' },
];

const PLACEHOLDER_ACCOUNTS = [
  { id: 'collector-1', name: 'Roel Macaraeg', role: 'collector', area: 'Barangay Triangulo', contact: '09171234567', email: 'roel@nagacity.gov.ph' },
  { id: 'collector-2', name: 'Jun Bustillo', role: 'collector', area: 'Barangay Dayangdang', contact: '09182345678', email: 'jun@nagacity.gov.ph' },
  { id: 'staff-1', name: 'Maria Santos', role: 'staff', area: 'Barangay Concepcion Grande', contact: '09193456789', email: 'maria@nagacity.gov.ph' },
  { id: 'collector-3', name: 'Eddie Villanueva', role: 'collector', area: 'Barangay Concepcion Grande', contact: '09204567890', email: 'eddie@nagacity.gov.ph' },
  { id: 'staff-2', name: 'Luz Bernal', role: 'staff', area: 'Barangay Calaauag', contact: '09215678901', email: 'luz@nagacity.gov.ph' },
];

const PLACEHOLDER_ROUTES = [
  { id: 'route-1', area: 'Barangay Triangulo', street: 'Peñafrancia Ave.', collector: 'Roel Macaraeg', date: '2025-06-28', status: 'collected', flagged: false },
  { id: 'route-2', area: 'Barangay Triangulo', street: 'Gen. Luna St.', collector: 'Roel Macaraeg', date: '2025-06-28', status: 'not collected', flagged: true },
  { id: 'route-3', area: 'Barangay Concepcion Grande', street: 'Burgos St.', collector: 'Eddie Villanueva', date: '2025-06-27', status: 'collected', flagged: false },
  { id: 'route-4', area: 'Barangay Dayangdang', street: 'Elias Angeles St.', collector: 'Jun Bustillo', date: '2025-06-27', status: 'not collected', flagged: true },
  { id: 'route-5', area: 'Barangay Bagumbayan Norte', street: 'Magsaysay Ave.', collector: 'Mario Reyes', date: '2025-06-26', status: 'collected', flagged: false },
  { id: 'route-6', area: 'Barangay Triangulo', street: 'Gen. Luna St.', collector: 'Roel Macaraeg', date: '2025-06-26', status: 'not collected', flagged: true },
  { id: 'route-7', area: 'Barangay Calaauag', street: 'Lerma St.', collector: 'Mario Reyes', date: '2025-06-25', status: 'not collected', flagged: false },
  { id: 'route-8', area: 'Barangay Concepcion Grande', street: 'Roxas Ave.', collector: 'Eddie Villanueva', date: '2025-06-25', status: 'collected', flagged: false },
];

const PLACEHOLDER_COMPLAINTS = [
  { id: 'complaint-1', street: 'Gen. Luna St., Triangulo', bags: 12, time: '6:42 AM', date: 'Jun 28, 2025', reporter: 'Maria Reyes', status: 'pending' },
  { id: 'complaint-2', street: 'Elias Angeles St., Dayangdang', bags: 7, time: '7:15 AM', date: 'Jun 28, 2025', reporter: 'Jose Dela Cruz', status: 'verified' },
  { id: 'complaint-3', street: 'Lerma St., Calaauag', bags: 3, time: '8:01 AM', date: 'Jun 27, 2025', reporter: 'Ana Villanueva', status: 'resolved' },
  { id: 'complaint-4', street: 'Burgos St., Concepcion Grande', bags: 9, time: '9:22 AM', date: 'Jun 27, 2025', reporter: 'Ramon Santos', status: 'pending' },
];

const PLACEHOLDER_ACTIVITY = [
  { id: 'activity-1', area: 'Barangay Triangulo', driver: 'Roel Macaraeg', length: '3.2', width: '2.1', height: '1.5', slope: '0.05', tonnage: '21.17 t', time: '06:45 AM' },
  { id: 'activity-2', area: 'Barangay Dayangdang', driver: 'Jun Bustillo', length: '2.8', width: '2', height: '1.3', slope: '0.04', tonnage: '17.12 t', time: '07:30 AM' },
  { id: 'activity-3', area: 'Barangay Concepcion Grande', driver: 'Eddie Villanueva', length: '3.5', width: '2.2', height: '1.6', slope: '0.06', tonnage: '26.57 t', time: '08:15 AM' },
  { id: 'activity-4', area: 'Barangay Calaauag', driver: 'Mario Reyes', length: '2.5', width: '1.9', height: '1.2', slope: '0.03', tonnage: '13.24 t', time: '09:00 AM' },
];

const EMPTY_ACCOUNT = { name: '', contact: '', email: '', password: '', role: 'collector' };

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}

function titleCase(value = '') {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Pending';
}

function StatusChip({ status }) {
  const normalized = status.toLowerCase();
  const label = normalized === 'verified' ? 'Scheduled' : titleCase(normalized);
  return <Chip className={`status-chip status-${normalized.replace(' ', '-')}`} size="sm">{label}</Chip>;
}

function PanelTitle({ title, subtitle, action }) {
  return (
    <div className="panel-title">
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function MetricCard({ icon, label, value, caption, tone = 'green' }) {
  return (
    <Card className="metric-card">
      <div className={`metric-icon metric-${tone}`}>{icon}</div>
      <div>
        <p className="metric-label">{label}</p>
        <strong className="metric-value">{value}</strong>
        <p className="metric-caption">{caption}</p>
      </div>
    </Card>
  );
}

function TonnageChart() {
  return (
    <svg aria-label="Tonnage trend for June 2025" className="tonnage-chart" role="img" viewBox="0 0 1000 225">
      <defs>
        <linearGradient id="tonnage-fill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#0c8a68" stopOpacity="0.15" />
          <stop offset="1" stopColor="#0c8a68" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d="M40 75 C120 86 160 91 210 86 S300 43 370 49 S480 62 540 52 S630 27 690 37 S790 61 850 53 S920 45 975 43 L975 185 L40 185 Z" fill="url(#tonnage-fill)" />
      <path d="M40 75 C120 86 160 91 210 86 S300 43 370 49 S480 62 540 52 S630 27 690 37 S790 61 850 53 S920 45 975 43" fill="none" stroke="#087e60" strokeWidth="2.3" />
      {[['40', '75'], ['210', '86'], ['370', '49'], ['540', '52'], ['690', '37'], ['850', '53'], ['975', '43']].map(([cx, cy]) => <circle cx={cx} cy={cy} fill="#087e60" key={cx} r="3.5" />)}
      {[['60', '0'], ['55', '45'], ['50', '30'], ['45', '15']].map(([x, value]) => <text className="chart-axis" key={value} x={x} y={Number(value) ? 150 - Number(value) * 2.3 : 188}>{value}</text>)}
      {['Jun 1', 'Jun 5', 'Jun 10', 'Jun 15', 'Jun 20', 'Jun 25', 'Jun 28'].map((label, index) => <text className="chart-label" key={label} textAnchor="middle" x={[40, 210, 370, 540, 690, 850, 975][index]} y="207">{label}</text>)}
    </svg>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const token = sessionStorage.getItem('resiklean_admin_token');
  const storedUser = JSON.parse(sessionStorage.getItem('resiklean_admin_user') || '{}');
  const [activePage, setActivePage] = useState('overview');
  const [search, setSearch] = useState('');
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [submissionState, setSubmissionState] = useState({ loading: false, message: '', error: '' });
  const [apiData, setApiData] = useState({ users: null, routes: null, reports: null, loads: null, compliance: null, usingPlaceholder: true });

  useEffect(() => {
    if (!API_URL || !token) return undefined;

    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    const fetchAdminData = async () => {
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
        if (results.some((result) => !result.success)) throw new Error('The admin API returned an incomplete response.');
        if (!cancelled) {
          setApiData({
            users: results[0].data?.users || [],
            routes: results[1].data?.routes || [],
            reports: results[2].data?.reports || [],
            loads: results[3].data?.loads || [],
            compliance: results[4].data?.report || [],
            usingPlaceholder: false,
          });
        }
      } catch {
        if (!cancelled) setApiData((current) => ({ ...current, usingPlaceholder: true }));
      }
    };
    fetchAdminData();
    return () => { cancelled = true; };
  }, [token]);

  const accountRows = useMemo(() => {
    if (!apiData.users?.length) return [...createdAccounts, ...PLACEHOLDER_ACCOUNTS];
    return [...createdAccounts, ...apiData.users.filter((user) => ['collector', 'staff'].includes(user.role)).map((user) => ({
      id: user._id,
      name: user.name,
      role: user.role,
      area: user.barangay || 'Not assigned',
      contact: user.contact || '—',
      email: user.email,
    }))];
  }, [apiData.users, createdAccounts]);

  const routeRows = useMemo(() => {
    if (!apiData.routes?.length) return PLACEHOLDER_ROUTES;
    return apiData.routes.map((route) => ({
      id: route._id,
      area: route.barangay || 'Not assigned',
      street: route.name || 'Unnamed route',
      collector: route.collectorId?.name || 'Unassigned',
      date: 'Current schedule',
      status: route.isActive === false ? 'not collected' : 'collected',
      flagged: false,
      collectorId: route.collectorId?._id,
    }));
  }, [apiData.routes]);

  const complaintRows = useMemo(() => {
    if (!apiData.reports?.length) return PLACEHOLDER_COMPLAINTS;
    return apiData.reports.map((report) => ({
      id: report._id,
      street: report.description || `${report.barangay || 'Unassigned area'} report`,
      bags: report.aiVerified ? Math.max(1, Math.round((report.aiConfidence || 0.5) * 12)) : '—',
      time: new Date(report.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
      date: new Date(report.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
      reporter: report.residentId?.name || 'Resident',
      status: report.status || 'pending',
    }));
  }, [apiData.reports]);

  const activityRows = useMemo(() => {
    if (!apiData.loads?.length) return PLACEHOLDER_ACTIVITY;
    return apiData.loads.map((load) => ({
      id: load._id,
      area: load.routeId?.barangay || 'Unassigned area',
      driver: load.staffId?.name || 'Staff member',
      length: load.length ? (load.length / 100).toFixed(1) : '—',
      width: load.width ? (load.width / 100).toFixed(1) : '—',
      height: load.height ? (load.height / 100).toFixed(1) : '—',
      slope: '—',
      tonnage: `${Number(load.tonnesEstimate || 0).toFixed(2)} t`,
      time: new Date(load.arrivedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }),
    }));
  }, [apiData.loads]);

  const filteredAccounts = accountRows.filter((account) => `${account.name} ${account.email} ${account.area}`.toLowerCase().includes(search.toLowerCase()));
  const filteredRoutes = routeRows.filter((route) => `${route.area} ${route.street} ${route.collector}`.toLowerCase().includes(search.toLowerCase()));

  const signOut = () => {
    sessionStorage.removeItem('resiklean_admin_token');
    sessionStorage.removeItem('resiklean_admin_user');
    navigate('/login', { replace: true });
  };

  const updateComplaintStatus = (id, status) => {
    // Status controls are kept interactive with placeholder data. The backend
    // version can be connected to PATCH /api/admin/reports/:reportId later.
    setSubmissionState({ loading: false, error: '', message: `Complaint status set to ${titleCase(status)} locally.` });
    setApiData((current) => ({
      ...current,
      reports: current.reports?.map((report) => report._id === id ? { ...report, status } : report) || current.reports,
    }));
  };

  const createAccount = async (event) => {
    event.preventDefault();
    setSubmissionState({ loading: true, error: '', message: '' });
    const localAccount = {
      id: `local-${Date.now()}`,
      name: newAccount.name,
      role: newAccount.role,
      area: 'Not assigned',
      contact: newAccount.contact || '—',
      email: newAccount.email,
    };

    try {
      if (API_URL && token) {
        const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/users`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: newAccount.name, email: newAccount.email, password: newAccount.password, role: newAccount.role }),
        });
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

  const overview = (
    <>
      <div className="metrics-grid">
        <MetricCard caption="↑ 2.4% vs last week" icon="✓" label="Collection Completion Rate" value="87.3%" />
        <MetricCard caption="As of June 28" icon="↗" label="Total Tonnage This Month" tone="teal" value="338.1 t" />
        <MetricCard caption="Requires action" icon="!" label="Pending Complaints" tone="amber" value={String(complaintRows.filter((item) => item.status === 'pending').length)} />
      </div>
      <Card className="chart-card">
        <div className="card-heading-row">
          <div><h3>Tonnage Trend</h3><p>Volume collected per day · June 2025</p></div>
          <Button className="outline-button" variant="secondary">⇩&nbsp; Export</Button>
        </div>
        <TonnageChart />
      </Card>
      <Card className="overview-routes">
        <div className="card-heading-row overview-route-heading">
          <div><h3>Route History</h3><p>Street-level collection tracking</p></div>
          <button className="text-button" onClick={() => setActivePage('routes')}>View full Route History&nbsp; →</button>
        </div>
        {routeRows.slice(0, 4).map((route) => <RoutePreview key={route.id} route={route} />)}
        <button className="view-more" onClick={() => setActivePage('routes')}>View all {routeRows.length} entries&nbsp; →</button>
      </Card>
    </>
  );

  const routeHistory = (
    <>
      <PanelTitle action={<Button className="outline-button" variant="secondary">⇩&nbsp; Export</Button>} subtitle="Street-level collection tracking by Collector" title="Route History Report" />
      <Card className="table-card">
        <div className="filter-row">
          <select aria-label="Filter by collector" defaultValue="all"><option value="all">All Collectors</option>{accountRows.filter((account) => account.role === 'collector').map((account) => <option key={account.id}>{account.name}</option>)}</select>
          <select aria-label="Filter by area" defaultValue="all"><option value="all">All Areas</option>{[...new Set(routeRows.map((route) => route.area))].map((area) => <option key={area}>{area}</option>)}</select>
          <input aria-label="Filter by date" type="date" />
          <span className="entries-count">{filteredRoutes.length} entries</span>
        </div>
        <div className="table-scroll"><table><thead><tr><th>Area</th><th>Date</th><th>Street</th><th>Collector</th><th>Status</th></tr></thead><tbody>
          {filteredRoutes.map((route) => <tr key={route.id}><td>{route.area}{route.flagged ? <span className="flag">⚠ Flagged</span> : null}</td><td>{route.date}</td><td>{route.street}</td><td><AvatarName name={route.collector} /></td><td><StatusChip status={route.status} /></td></tr>)}
        </tbody></table></div>
      </Card>
    </>
  );

  const complaints = (
    <>
      <PanelTitle action={<Chip className="pending-count" size="sm">{complaintRows.filter((complaint) => complaint.status === 'pending').length} Pending</Chip>} subtitle="Resident-submitted reports with AI-detected bag count" title="Pending Complaint Queue" />
      <div className="complaint-list">
        {complaintRows.map((complaint) => <Card className="complaint-card" key={complaint.id}>
          <div className="complaint-art">♻</div>
          <div className="complaint-main"><h3>{complaint.street}</h3><p>◇ {complaint.bags} bags detected &nbsp; ◷ {complaint.time}</p></div>
          <div className="complaint-meta"><span>Date</span><strong>▣ {complaint.date}</strong></div>
          <div className="complaint-meta"><span>Reported by</span><strong>♙ {complaint.reporter}</strong></div>
          <select aria-label={`Update ${complaint.street} status`} className={`complaint-status status-${complaint.status}`} onChange={(event) => updateComplaintStatus(complaint.id, event.target.value)} value={complaint.status}>
            <option value="pending">Pending</option><option value="verified">Scheduled</option><option value="resolved">Resolved</option><option value="rejected">Rejected</option>
          </select>
        </Card>)}
      </div>
    </>
  );

  const activity = (
    <Card className="table-card staff-activity-card">
      <div className="card-heading-row"><div><h3>Staff Activity Log</h3><p>Volumetric measurements and computed tonnage · June 28, 2025</p></div></div>
      <div className="table-scroll"><table><thead><tr><th>Area</th><th>Driver</th><th>L (m)</th><th>W (m)</th><th>H (m)</th><th>Slope</th><th>Tonnage</th><th>Time</th></tr></thead><tbody>
        {activityRows.map((row) => <tr key={row.id}><td>{row.area}</td><td><strong>{row.driver}</strong></td><td>{row.length}</td><td>{row.width}</td><td>{row.height}</td><td>{row.slope}</td><td className="tonnage-cell">{row.tonnage}</td><td>{row.time}</td></tr>)}
      </tbody></table></div>
    </Card>
  );

  const assignments = (
    <>
      <PanelTitle action={<Chip className="active-count" size="sm">{routeRows.filter((route) => route.collector !== 'Unassigned').length} Active Collectors</Chip>} subtitle="Manage and reassign collectors to SWMO areas" title="Collector Assignments" />
      <Card className="table-card"><div className="table-scroll"><table><thead><tr><th>Collector</th><th>Currently Assigned Area</th><th>Last Updated</th><th>Action</th></tr></thead><tbody>
        {routeRows.slice(0, 5).map((route) => <tr key={route.id}><td><AvatarName name={route.collector} /></td><td>⌖&nbsp; {route.area}</td><td>Jun 28, 2025 · 6:00 AM</td><td><Button className="reassign-button" variant="secondary">⟳&nbsp; Reassign</Button></td></tr>)}
      </tbody></table></div></Card>
    </>
  );

  const accounts = (
    <>
      <PanelTitle action={<Button className="primary-button" onPress={() => { setSubmissionState({ loading: false, error: '', message: '' }); setShowAccountForm(true); }}>＋&nbsp; Add Account</Button>} subtitle="Manage collector and staff accounts" title="Account Management" />
      {submissionState.message ? <p className="feedback success-feedback">{submissionState.message}</p> : null}
      {submissionState.error ? <p className="feedback error-feedback">{submissionState.error}</p> : null}
      <Card className="table-card"><div className="table-scroll"><table><thead><tr><th>Name</th><th>Role</th><th>Assigned Area</th><th>Contact</th><th>Email</th><th>Actions</th></tr></thead><tbody>
        {filteredAccounts.map((account) => <tr key={account.id}><td><AvatarName name={account.name} /></td><td><Chip className={`role-chip role-${account.role}`} size="sm">{titleCase(account.role)}</Chip></td><td>{account.area}</td><td>{account.contact}</td><td>{account.email}</td><td><button aria-label={`Edit ${account.name}`} className="icon-action">⌕</button><button aria-label={`Delete ${account.name}`} className="icon-action">♲</button></td></tr>)}
      </tbody></table></div></Card>
    </>
  );

  const pageContent = { overview, routes: routeHistory, complaints, activity, assignments, accounts }[activePage];
  const activeLabel = NAV_ITEMS.find((item) => item.id === activePage)?.label || 'Overview';

  return (
    <main className="admin-shell">
      <aside className="admin-sidebar">
        <div className="brand"><strong>SWMO</strong><span>Administrator</span></div>
        <nav>{NAV_ITEMS.map((item) => <button className={activePage === item.id ? 'nav-link active' : 'nav-link'} key={item.id} onClick={() => setActivePage(item.id)}><span>{item.icon}</span>{item.label}</button>)}</nav>
        <button className="signout-button" onClick={signOut}>⇥&nbsp; Sign Out</button>
      </aside>
      <section className="admin-workspace">
        <header className="topbar"><div><h1>{activeLabel}</h1><p>Naga City Solid Waste Management Office · June 28, 2025</p></div><div className="topbar-actions"><Input aria-label="Search dashboard" className="search-input" onChange={(event) => setSearch(event.target.value)} placeholder="⌕  Search..." value={search} /><button aria-label="Notifications" className="notification-button">♧<i /></button><div className="topbar-avatar">{initials(storedUser.name || 'Admin')}</div><strong className="admin-name">{storedUser.name || 'Admin'}</strong></div></header>
        <section className="dashboard-content">{apiData.usingPlaceholder ? <p className="data-note">Showing placeholder data where the current backend has no response or matching field.</p> : null}{pageContent}</section>
      </section>
      {showAccountForm ? <div className="modal-layer" role="presentation"><div aria-modal="true" className="account-modal" role="dialog"><form onSubmit={createAccount}><div className="modal-header"><h2>Add New Account</h2><button aria-label="Close account form" onClick={() => setShowAccountForm(false)} type="button">×</button></div><div className="modal-body"><label>Full Name<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Juan dela Cruz" required value={newAccount.name} /></label><label>Contact Number<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, contact: event.target.value }))} placeholder="09XXXXXXXXX" value={newAccount.contact} /></label><label>Email Address<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, email: event.target.value }))} placeholder="user@nagacity.gov.ph" required type="email" value={newAccount.email} /></label><label>Temporary Password<Input fullWidth minLength="6" onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} placeholder="At least 6 characters" required type="password" value={newAccount.password} /></label><label>Role<select onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value }))} value={newAccount.role}><option value="collector">Collector</option><option value="staff">Staff</option></select></label><p className="field-note">Contact number is shown as a dashboard placeholder; the current backend only stores name, email, password, and role.</p>{submissionState.error ? <p className="feedback error-feedback">{submissionState.error}</p> : null}</div><div className="modal-footer"><Button className="outline-button" onPress={() => setShowAccountForm(false)} type="button" variant="secondary">Cancel</Button><Button className="primary-button" isDisabled={submissionState.loading} type="submit">{submissionState.loading ? 'Creating…' : 'Create Account'}</Button></div></form></div></div> : null}
    </main>
  );
}

function AvatarName({ name }) {
  return <span className="avatar-name"><span className="table-avatar">{initials(name)}</span><span>{name}</span></span>;
}

function RoutePreview({ route }) {
  return <div className={`route-preview ${route.flagged ? 'flagged-route' : ''}`}><div><strong>{route.street}</strong>{route.flagged ? <span className="flag">⚠ Flagged</span> : null}<p>{route.area} · {route.collector}</p></div><span>{route.date}</span><StatusChip status={route.status} /></div>;
}
