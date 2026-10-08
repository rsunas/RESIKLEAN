import { Button, Card, Chip, Input } from '@heroui/react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import AppSelect from '../components/AppSelect.jsx';
import TruckManagementPanel from '../components/TruckManagementPanel.jsx';
import RouteAssignmentPanel from '../components/RouteAssignmentPanel.jsx';

const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL?.replace(/\/api\/?$/, '');

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'routes', label: 'Route History', icon: 'route' },
  { id: 'complaints', label: 'Complaints', icon: 'alert' },
  { id: 'activity', label: 'Staff Activity', icon: 'chart' },
  { id: 'assignments', label: 'Collector Assignments', icon: 'operations' },
  { id: 'accounts', label: 'Manage Accounts', icon: 'id-card' },
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

const EMPTY_ACCOUNT = { name: '', contact: '', email: '', password: '', role: 'collector', avatarFile: null, avatarPreview: '' };

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}

function titleCase(value = '') {
  return value ? `${value.charAt(0).toUpperCase()}${value.slice(1)}` : 'Pending';
}

function formatTonnes(value) {
  return `${Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 1 })} t`;
}

function routeAreaCode(routeOrName = '') {
  const routeName = typeof routeOrName === 'object'
    ? routeOrName.name || routeOrName.routeName || routeOrName.area || ''
    : routeOrName;
  const match = String(routeName).match(/\barea\s+(\d+[a-z]?)\b/i);
  return match ? `Area ${match[1].toUpperCase()}` : String(routeName || 'Unassigned area');
}

function routeStreetList(route = {}) {
  if (Array.isArray(route.barangay)) return route.barangay.filter(Boolean).join(', ') || 'No street or barangay recorded';
  return route.barangay || route.street || 'No street or barangay recorded';
}

function formatReportDate(value) {
  if (!value) return 'Date unavailable';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date unavailable' : date.toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' });
}

function mapCoordinateList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      const longitude = Number(point?.longitude ?? point?.[0]);
      const latitude = Number(point?.latitude ?? point?.[1]);
      return Number.isFinite(longitude) && Number.isFinite(latitude) ? [longitude, latitude] : null;
    })
    .filter(Boolean);
}

function projectRouteCoordinates(coordinates, width = 620, height = 280, boundsCoordinates = coordinates) {
  if (!coordinates.length) return '';
  const longitudes = boundsCoordinates.map(([longitude]) => longitude);
  const latitudes = boundsCoordinates.map(([, latitude]) => latitude);
  const minLon = Math.min(...longitudes);
  const maxLon = Math.max(...longitudes);
  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const lonSpan = Math.max(maxLon - minLon, 0.00001);
  const latSpan = Math.max(maxLat - minLat, 0.00001);
  const padding = 34;
  return coordinates
    .map(([longitude, latitude]) => `${padding + ((longitude - minLon) / lonSpan) * (width - padding * 2)},${height - padding - ((latitude - minLat) / latSpan) * (height - padding * 2)}`)
    .join(' ');
}

function getReportBagCount(report = {}) {
  const count = report.detectedBagCount ?? report.bagCount ?? report.aiResult?.detectedBagCount ?? report.aiResult?.bagCount;
  if (typeof count === 'number') return `${count} bag${count === 1 ? '' : 's'}`;
  if (report.aiVerified && typeof report.aiConfidence === 'number') return `${Math.max(1, Math.round(report.aiConfidence * 12))} bags estimated`;
  return 'Not available';
}

function normalizeId(value) {
  if (!value) return '';
  if (typeof value === 'object') return normalizeId(value._id || value.id);
  return String(value);
}

function mergeRealtimeReports(reports, payload) {
  const currentReports = Array.isArray(reports) ? reports : [];
  const incomingReport = payload?.report && typeof payload.report === 'object' ? payload.report : {};
  const reportId = normalizeId(incomingReport._id || payload?.reportId);
  if (!reportId) return currentReports;

  const nextReport = {
    ...incomingReport,
    _id: reportId,
    status: incomingReport.status || payload.status || 'pending',
  };
  const existingIndex = currentReports.findIndex((report) => normalizeId(report._id) === reportId);
  if (existingIndex === -1) return [nextReport, ...currentReports];

  return currentReports.map((report, index) => index === existingIndex ? { ...report, ...nextReport } : report);
}

function mergeComplaintRow(complaint, payload) {
  if (!complaint) return complaint;
  const incomingReport = payload?.report && typeof payload.report === 'object' ? payload.report : {};
  const reportId = normalizeId(incomingReport._id || payload?.reportId);
  const complaintId = normalizeId(complaint.id || complaint.report?._id);
  if (!reportId || reportId !== complaintId) return complaint;

  const report = {
    ...(complaint.report || {}),
    ...incomingReport,
    _id: reportId,
    status: incomingReport.status || payload.status || complaint.status || 'pending',
  };
  return {
    ...complaint,
    bags: getReportBagCount(report),
    reporter: report.residentId?.name || complaint.reporter,
    report,
    status: report.status,
  };
}

function mergeReportMessages(messages, incoming) {
  if (!incoming?._id) return messages;
  const current = Array.isArray(messages) ? messages : [];
  if (current.some((message) => normalizeId(message._id) === normalizeId(incoming._id))) return current;
  return [...current, incoming].sort((left, right) => new Date(left.createdAt || 0) - new Date(right.createdAt || 0));
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
    'id-card': <><rect height="16" rx="2" width="18" x="3" y="4" /><circle cx="8" cy="10" r="2" /><path d="M13 9h5M13 13h5" /></>,
    operations: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    truck: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="2" /><circle cx="18" cy="19" r="2" /></>,
    search: <><circle cx="11" cy="11" r="6" /><path d="m20 20-4.2-4.2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M21 19V5a2 2 0 0 0-2-2h-6" /></>,
    refresh: <><path d="M20 11a8.1 8.1 0 0 0-15.5-2M4 5v4h4M4 13a8.1 8.1 0 0 0 15.5 2M20 19v-4h-4" /></>,
    arrow: <path d="m9 18 6-6-6-6" />,
    plus: <path d="M12 5v14m-7-7h14" />,
    image: <><rect height="16" rx="2" width="18" x="3" y="4" /><circle cx="8.5" cy="9" r="1.5" /><path d="m3 17 5-5 3 3 2-2 8 7" /></>,
    inbox: <><path d="M4 5h16v12H4z" /><path d="M4 13h4l2 3h4l2-3h4" /></>,
  };
  return <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{paths[name] || paths.grid}</svg>;
}

function StatusChip({ status }) {
  const normalized = status.toLowerCase();
  const label = titleCase(normalized);
  return <Chip className={`status-chip status-${normalized.replace(' ', '-')}`} size="sm">{label}</Chip>;
}

function MetricSparkline({ data, color }) {
  const chartData = data.map((item) => ({ value: Number(item.tonnes ?? item.value ?? 0) }));
  return <div className="metric-sparkline"><ResponsiveContainer height="100%" width="100%"><AreaChart data={chartData} margin={{ top: 6, right: 0, bottom: 4, left: 0 }}><defs><linearGradient id={`metric-fill-${color.replace('#', '')}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity={0.18} /><stop offset="100%" stopColor={color} stopOpacity={0.01} /></linearGradient></defs><Area dataKey="value" fill={`url(#metric-fill-${color.replace('#', '')})`} isAnimationActive={false} stroke={color} strokeWidth={2} type="monotone" /></AreaChart></ResponsiveContainer></div>;
}

function MetricCard({ icon, label, value, caption, tone = 'green', trend = [], progress }) {
  const progressValue = Math.max(0, Math.min(100, Number(progress || 0)));
  const chartColor = tone === 'teal' ? '#078e78' : tone === 'amber' ? '#d39a21' : '#07815f';
  return <Card className="metric-card"><div className={`metric-icon metric-${tone}`}><Icon name={icon} size={16} /></div><div className="metric-content"><p className="metric-label">{label}</p><strong className="metric-value">{value}</strong><p className="metric-caption">{caption}</p>{progress !== undefined ? <div aria-label={`${progressValue}% complete`} className="metric-progress"><span style={{ width: `${progressValue}%` }} /></div> : null}</div>{trend.length > 1 ? <MetricSparkline color={chartColor} data={trend} /> : null}</Card>;
}

function TonnageChart({ series }) {
  if (!series.length) {
    return <div className="chart-empty"><Icon name="chart" size={24} /><p>No submitted truckloads yet.</p><span>Daily tonnage will appear after staff record landfill loads.</span></div>;
  }

  const chartData = series.map((item) => ({
    ...item,
    label: item.date.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
  }));

  return (
    <div aria-label={`Daily tonnage trend from ${formatTrendRange(series)}`} className="tonnage-chart" role="img">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 12, left: 8, bottom: 0 }}>
          <defs><linearGradient id="tonnage-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="#07815f" stopOpacity={0.18} /><stop offset="100%" stopColor="#07815f" stopOpacity={0.02} /></linearGradient></defs>
          <CartesianGrid stroke="#dbe7e1" strokeDasharray="3 5" />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: '#71837a', fontSize: 11 }} tickLine={false} />
          <YAxis axisLine={false} tick={{ fill: '#71837a', fontSize: 11 }} tickFormatter={(value) => formatTonnes(value)} tickLine={false} width={48} />
          <Tooltip content={<TonnageTooltip />} cursor={{ stroke: '#9ccab5', strokeDasharray: '4 4' }} />
          <Area activeDot={{ fill: '#fff', r: 4, stroke: '#07815f', strokeWidth: 2 }} dataKey="tonnes" fill="url(#tonnage-fill)" stroke="#07815f" strokeWidth={2.5} type="monotone" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function TonnageTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return <div className="tonnage-tooltip"><strong>{point.label}</strong><span>{formatTonnes(point.tonnes)}</span></div>;
}

function AvatarName({ name, photoUrl }) {
  return <span className="avatar-name">{photoUrl ? <img alt="" className="table-avatar" src={photoUrl} /> : <span className="table-avatar">{initials(name)}</span>}<span>{name}</span></span>;
}

function RoutePreview({ route }) {
  return <div className={`route-preview ${route.flagged ? 'flagged-route' : ''}`}><div><strong>{route.street}</strong>{route.flagged ? <span className="flag">Flagged</span> : null}<p>{route.area} · {route.collector}</p></div><span>{route.date}</span><StatusChip status={route.status} /></div>;
}

function ComplaintDetailsModal({ complaint, onClose }) {
  if (!complaint) return null;

  const report = complaint.report || complaint;
  const reporter = report.residentId?.name || complaint.reporter || 'Resident';
  const email = report.residentId?.email || 'Not available';
  const status = report.status || complaint.status || 'pending';

  return (
    <div className="modal-layer" onClick={onClose} role="presentation">
      <div aria-labelledby="complaint-details-title" aria-modal="true" className="activity-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog">
        <div className="modal-header">
          <div>
            <p className="eyebrow">Resident complaint</p>
            <h2 id="complaint-details-title">Complaint details</h2>
          </div>
          <button aria-label="Close complaint details" onClick={onClose} type="button">×</button>
        </div>
        <div className="activity-detail-body">
          {report.photoUrl ? <img alt={`Submitted complaint from ${reporter}`} className="activity-detail-photo" src={report.photoUrl} /> : <div className="activity-photo-empty"><Icon name="image" size={28} /><p>No submitted photo available</p></div>}
          <div className="activity-detail-grid">
            <div><span>Location</span><strong>{report.barangay || 'Location not recorded'}</strong></div>
            <div><span>Reported by</span><strong>{reporter}</strong></div>
            <div><span>Resident email</span><strong>{email}</strong></div>
            <div><span>Submitted</span><strong>{formatReportDate(report.createdAt)}</strong></div>
            <div><span>Detected bags</span><strong>{getReportBagCount(report)}</strong></div>
            <div><span>Current status</span><StatusChip status={status} /></div>
            <div><span>AI verification</span><strong>{report.aiVerified ? `Verified${typeof report.aiConfidence === 'number' ? ` (${Math.round(report.aiConfidence * 100)}% confidence)` : ''}` : 'Not verified'}</strong></div>
          </div>
          {report.description ? <div className="activity-detail-notes"><span>Resident note</span><p>{report.description}</p></div> : null}
        </div>
        <div className="modal-footer"><Button className="outline-button" onPress={onClose} type="button" variant="secondary">Close</Button></div>
      </div>
    </div>
  );
}

function ComplaintInbox({ complaints, selectedComplaint, onSelect, onStatusChange, realtimeMessagesByReport, token }) {
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const filteredComplaints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return complaints;
    return complaints.filter((complaint) => {
      const report = complaint.report || complaint;
      const reporter = report.residentId?.name || complaint.reporter || 'Resident';
      return [reporter, complaint.street, report.description, report.barangay].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });
  }, [complaints, query]);

  const activeComplaint = selectedComplaint && complaints.find((complaint) => complaint.id === selectedComplaint.id);
  const report = activeComplaint?.report || activeComplaint;
  const reporter = report?.residentId?.name || activeComplaint?.reporter || 'Resident';
  const status = report?.status || activeComplaint?.status || 'pending';
  const photoUrl = report?.photoUrl || activeComplaint?.photoUrl;

  useEffect(() => {
    const reportId = activeComplaint?.id;
    if (!reportId || !token || !API_URL) {
      setMessages([]);
      setMessageError('');
      return undefined;
    }

    let cancelled = false;
    setIsLoadingMessages(true);
    setMessageError('');
    fetch(`${API_URL.replace(/\/$/, '')}/admin/reports/${encodeURIComponent(reportId)}/messages`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load conversation.');
        if (!cancelled) {
          setMessages(result.data || []);
        }
      })
      .catch((error) => {
        if (!cancelled) setMessageError(error instanceof Error ? error.message : 'Unable to load conversation.');
      })
      .finally(() => {
        if (!cancelled) setIsLoadingMessages(false);
      });

    return () => { cancelled = true; };
  }, [activeComplaint?.id, token]);

  useEffect(() => {
    const liveMessages = activeComplaint?.id ? realtimeMessagesByReport?.[activeComplaint.id] || [] : [];
    if (liveMessages.length) setMessages((current) => liveMessages.reduce(mergeReportMessages, current));
  }, [activeComplaint?.id, realtimeMessagesByReport]);

  const sendMessage = async (event) => {
    event.preventDefault();
    const body = messageDraft.trim();
    const reportId = activeComplaint?.id;
    if (!body || !reportId || !token || isSendingMessage) return;

    setIsSendingMessage(true);
    setMessageError('');
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/reports/${encodeURIComponent(reportId)}/messages`, {
        body: JSON.stringify({ body }),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to send message.');
      setMessages((current) => mergeReportMessages(current, result.data));
      setMessageDraft('');
    } catch (error) {
      setMessageError(error instanceof Error ? error.message : 'Unable to send message.');
    } finally {
      setIsSendingMessage(false);
    }
  };

  return <Card className="complaint-inbox-card">
    <aside className="complaint-inbox-list">
      <div className="complaint-inbox-search"><Icon name="search" size={17} /><Input aria-label="Search complaints" onChange={(event) => setQuery(event.target.value)} placeholder="Search complaints..." value={query} /></div>
      <div className="complaint-inbox-items">
        {filteredComplaints.length ? filteredComplaints.map((complaint) => {
          const itemReport = complaint.report || complaint;
          const itemReporter = itemReport.residentId?.name || complaint.reporter || 'Resident';
          const itemPhoto = itemReport.photoUrl || complaint.photoUrl;
          return <button className={`complaint-inbox-item ${activeComplaint?.id === complaint.id ? 'is-selected' : ''}`} key={complaint.id} onClick={() => onSelect(complaint)} type="button">
            {itemPhoto ? <img alt="" className="complaint-inbox-avatar complaint-inbox-photo" src={itemPhoto} /> : <span className="complaint-inbox-avatar">{initials(itemReporter)}</span>}
            <span className="complaint-inbox-copy"><strong>{itemReporter}</strong><b>{complaint.street}</b><small>{itemReport.description || `${complaint.bags} detected · ${complaint.time}`}</small></span>
            <span className="complaint-inbox-meta"><time>{complaint.time}</time><span className={`complaint-unread-dot status-${complaint.status}`} /></span>
          </button>;
        }) : <p className="complaint-inbox-empty">No complaints found.</p>}
      </div>
    </aside>
    <section className="complaint-conversation">
      {activeComplaint ? <>
        <header className="complaint-conversation-header"><div className="complaint-conversation-person"><span className="complaint-inbox-avatar">{initials(reporter)}</span><div><strong>{reporter}</strong><span>{activeComplaint.street}</span></div></div><StatusChip status={status} /></header>
        <div className="complaint-conversation-body">
          <p className="complaint-conversation-date">{formatReportDate(report.createdAt || activeComplaint.date)}</p>
          <div className="complaint-message-row"><span className="complaint-inbox-avatar">{initials(reporter)}</span><div className="complaint-message-bubble"><p>{report.description || `Missed collection reported at ${activeComplaint.street}.`}</p><span>{activeComplaint.time} · {activeComplaint.bags} detected</span></div></div>
          {photoUrl ? <img alt={`Submitted complaint from ${reporter}`} className="complaint-conversation-photo" src={photoUrl} /> : <div className="complaint-conversation-no-photo"><Icon name="image" size={19} /><span>No submitted photo available</span></div>}
          <div className="complaint-conversation-details"><div><span>Location</span><strong>{report.barangay || 'Location not recorded'}</strong></div><div><span>Email</span><strong>{report.residentId?.email || 'Not available'}</strong></div><div><span>AI verification</span><strong>{report.aiVerified ? 'Verified' : 'Not verified'}</strong></div></div>
          {report.photoMetadata ? <div className="complaint-photo-metadata"><span>Photo metadata</span><strong>{report.photoMetadata.capturedAt ? `Captured ${formatReportDate(report.photoMetadata.capturedAt)}` : 'Capture time unavailable'}{report.photoMetadata.latitude != null && report.photoMetadata.longitude != null ? ` · GPS ${Number(report.photoMetadata.latitude).toFixed(5)}, ${Number(report.photoMetadata.longitude).toFixed(5)}` : ''}{report.photoMetadata.width && report.photoMetadata.height ? ` · ${report.photoMetadata.width} × ${report.photoMetadata.height}px` : ''}</strong></div> : null}
          <div className="complaint-chat-thread"><div className="complaint-chat-heading"><strong>Conversation</strong><span>{isLoadingMessages ? 'Loading…' : 'Live updates'}</span></div><div className="complaint-chat-messages"><div className="complaint-chat-message complaint-chat-message-resident"><strong>{reporter}</strong><p>{report.description || `Missed collection reported at ${activeComplaint.street}.`}</p><time>{formatReportDate(report.createdAt || activeComplaint.date)}</time></div>{messages.map((message) => <div className={`complaint-chat-message ${message.senderRole === 'resident' ? 'complaint-chat-message-resident' : 'complaint-chat-message-admin'}`} key={message._id}><strong>{message.senderId?.name || (message.senderRole === 'resident' ? reporter : message.senderRole === 'collector' ? 'Driver' : 'SWMO Support')}</strong><p>{message.body}</p>{message.photoUrl ? <img alt="Driver resolution proof" className="complaint-chat-photo" src={message.photoUrl} /> : null}<time>{formatReportDate(message.createdAt)}</time></div>)}</div>{messageError ? <p className="feedback error-feedback">{messageError}</p> : null}<form className="complaint-chat-form" onSubmit={sendMessage}><input aria-label="Message resident" maxLength={1000} onChange={(event) => setMessageDraft(event.target.value)} placeholder="Write a reply…" value={messageDraft} /><button disabled={isSendingMessage || !messageDraft.trim()} type="submit">{isSendingMessage ? 'Sending…' : 'Send'}</button></form></div>
        </div>
        <footer className="complaint-conversation-footer"><label>Update complaint status<AppSelect aria-label={`Update ${activeComplaint.street} status`} className={`complaint-status status-${status}`} onChange={(nextStatus) => onStatusChange(activeComplaint.id, nextStatus)} options={[{ label: 'Pending', value: 'pending' }, { label: 'Verified', value: 'verified' }, { label: 'Resolved', value: 'resolved' }, { label: 'Rejected', value: 'rejected' }]} value={status} /></label></footer>
      </> : <div className="complaint-conversation-empty"><span><Icon name="inbox" size={24} /></span><h3>Nothing open</h3><p>Pick a complaint from the inbox to read it here.</p></div>}
    </section>
  </Card>;
}

function LogoutConfirmation({ onCancel, onConfirm }) {
  return <div className="modal-layer" onClick={onCancel} role="presentation"><div aria-modal="true" className="account-modal logout-confirm-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Account</p><h2>Sign out?</h2></div><button aria-label="Close sign-out confirmation" onClick={onCancel} type="button">×</button></div><div className="modal-body"><p className="field-note">Are you sure you want to sign out of the admin dashboard?</p></div><div className="modal-footer"><Button className="outline-button" onPress={onCancel} type="button" variant="secondary">Cancel</Button><button className="logout-confirm-button" onClick={onConfirm} type="button">Sign out</button></div></div></div>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = sessionStorage.getItem('resiklean_admin_token');
  const storedUser = JSON.parse(sessionStorage.getItem('resiklean_admin_user') || '{}');
  const requestedPage = searchParams.get('view');
  const activePage = NAV_ITEMS.some((item) => item.id === requestedPage) ? requestedPage : 'overview';
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [newAccount, setNewAccount] = useState(EMPTY_ACCOUNT);
  const [createdAccounts, setCreatedAccounts] = useState([]);
  const [submissionState, setSubmissionState] = useState({ loading: false, message: '', error: '' });
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [complaintUpdateError, setComplaintUpdateError] = useState('');
  const [routeHistoryRows, setRouteHistoryRows] = useState([]);
  const [routeHistoryPagination, setRouteHistoryPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [routeHistoryLoading, setRouteHistoryLoading] = useState(false);
  const [routeHistoryError, setRouteHistoryError] = useState('');
  const [selectedRouteHistory, setSelectedRouteHistory] = useState(null);
  const [isRouteHistoryDetailVisible, setIsRouteHistoryDetailVisible] = useState(false);
  const [routeDetailLoading, setRouteDetailLoading] = useState(false);
  const [routeDetailError, setRouteDetailError] = useState('');
  const [rhCollectorId, setRhCollectorId] = useState('all');
  const [rhBarangay, setRhBarangay] = useState('all');
  const [rhDateFrom, setRhDateFrom] = useState('');
  const [rhDateTo, setRhDateTo] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const socketRef = useRef(null);
  const [realtimeMessagesByReport, setRealtimeMessagesByReport] = useState({});
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

  useEffect(() => {
    if (!token || !SOCKET_URL) return undefined;

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;

    const handleComplaintEvent = (payload) => {
      const reportId = normalizeId(payload?.report?._id || payload?.reportId);
      if (!reportId) return;

      setApiData((current) => ({
        ...current,
        reports: mergeRealtimeReports(current.reports, payload),
        usingPlaceholder: false,
      }));
      setSelectedComplaint((current) => mergeComplaintRow(current, payload));
    };

    const handleMessageEvent = (payload) => {
      const reportId = normalizeId(payload?.reportId);
      const message = payload?.message;
      if (!reportId || !message?._id) return;
      setRealtimeMessagesByReport((current) => ({
        ...current,
        [reportId]: mergeReportMessages(current[reportId], message),
      }));
    };

    socket.on('complaint:created', handleComplaintEvent);
    socket.on('complaint:status-updated', handleComplaintEvent);
    socket.on('complaint:message-created', handleMessageEvent);

    return () => {
      socket.off('complaint:created', handleComplaintEvent);
      socket.off('complaint:status-updated', handleComplaintEvent);
      socket.off('complaint:message-created', handleMessageEvent);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token]);

  const loadRouteHistory = useCallback(async () => {
    if (!API_URL || !token) return;
    setRouteHistoryLoading(true);
    setRouteHistoryError('');
    try {
      const params = new URLSearchParams();
      if (rhCollectorId !== 'all') params.set('collectorId', rhCollectorId);
      if (rhBarangay !== 'all') params.set('barangay', rhBarangay);
      if (rhDateFrom) params.set('from', rhDateFrom);
      if (rhDateTo) params.set('to', rhDateTo);
      params.set('page', String(routeHistoryPagination.page));
      params.set('limit', String(routeHistoryPagination.limit));
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/route-history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load route history.');
      setRouteHistoryRows(Array.isArray(result.data?.rows) ? result.data.rows : []);
      setRouteHistoryPagination({
        page: Number(result.data?.page || 1),
        limit: Number(result.data?.limit || 25),
        total: Number(result.data?.count || 0),
        totalPages: Number(result.data?.pages || 1),
      });
    } catch (error) {
      setRouteHistoryRows([]);
      setRouteHistoryError(error instanceof Error ? error.message : 'Unable to load route history.');
    } finally {
      setRouteHistoryLoading(false);
    }
  }, [API_URL, rhBarangay, rhCollectorId, rhDateFrom, rhDateTo, routeHistoryPagination.limit, routeHistoryPagination.page, token]);

  const loadRouteHistoryDetail = useCallback(async (id) => {
    if (!API_URL || !token) return null;
    setRouteDetailLoading(true);
    setRouteDetailError('');
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/route-history/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load route history detail.');
      setSelectedRouteHistory(result.data || null);
      return result.data || null;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to load route history detail.';
      setRouteDetailError(msg);
      setSelectedRouteHistory(null);
      return null;
    } finally {
      setRouteDetailLoading(false);
    }
  }, [API_URL, token]);

  const openRouteHistoryDetail = useCallback(async (row) => {
    setIsRouteHistoryDetailVisible(true);
    setSelectedRouteHistory(null);
    setRouteDetailError('');
    if (!row?.id) return;
    await loadRouteHistoryDetail(row.id);
  }, [loadRouteHistoryDetail]);

  const exportRouteHistoryPDF = useCallback(async () => {
    if (!API_URL || !token || !selectedRouteHistory?.id) return;
    setIsExportingPdf(true);
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/route-history/${encodeURIComponent(selectedRouteHistory.id)}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Unable to generate PDF.');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || `Route-History-${selectedRouteHistory.id || 'report'}.pdf`;
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setRouteDetailError(error instanceof Error ? error.message : 'Unable to export PDF.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [API_URL, selectedRouteHistory?.id, token]);

  useEffect(() => {
    if (activePage === 'routes') void loadRouteHistory();
  }, [activePage, loadRouteHistory]);

  const routeHistoryFilterCollectors = useMemo(() => [{ label: 'All collectors', value: 'all' }, ...(apiData.users?.filter((u) => u.role === 'collector').map((u) => ({ label: u.name, value: u._id })) || [])], [apiData.users]);
  const routeHistoryFilterBarangays = useMemo(() => {
    const set = new Set();
    (apiData.routes || []).forEach((r) => {
      const areas = Array.isArray(r.barangay) ? r.barangay : [r.barangay];
      areas.filter(Boolean).forEach((b) => set.add(String(b)));
    });
    routeHistoryRows.forEach((row) => {
      if (row.area) set.add(String(row.area));
      if (row.barangay) set.add(String(row.barangay));
    });
    return [{ label: 'All areas', value: 'all' }, ...[...set].sort().map((b) => ({ label: b, value: b }))];
  }, [apiData.routes, routeHistoryRows]);

  const formatRHTime = (value) => value ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Manila' }).format(new Date(value)) : '—';
  const formatRHShiftTime = (value) => value ? new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Manila' }).format(new Date(value)) : 'Not recorded';
  const getRhFlaggedCount = (row) => Number(row?.flaggedCount ?? row?.flagged ?? 0);
  const getRhCollectorName = (row) => row?.collector || row?.collectorName || row?.collectorId?.name || 'Unknown';
  const getRhArea = (row) => row?.area || row?.barangay || '—';
  const getRhEntry = (row) => row?.geofenceEntry || row?.geofenceEntryAt || null;
  const getRhExit = (row) => row?.geofenceExit || row?.geofenceExitAt || null;
  const getRhShiftStart = (row) => row?.cycle?.shiftStart || row?.shiftStart || null;
  const getRhShiftEnd = (row) => row?.cycle?.shiftEnd || row?.shiftEnd || null;
  const getRhTruckTitle = (row) => row?.truck?.plateNumber || row?.truckPlate || '—';
  const getRhTruckSubtitle = (row) => [row?.truck?.truckNumber, row?.truck?.color].filter(Boolean).join(' · ') || row?.truckModel || '';

  const accountRows = useMemo(() => {
    if (!apiData.users?.length) return [...createdAccounts, ...PLACEHOLDER_ACCOUNTS];
    return [...createdAccounts, ...apiData.users.filter((user) => ['collector', 'staff'].includes(user.role)).map((user) => ({ id: user._id, name: user.name, role: user.role, area: user.barangay || 'Not assigned', contact: user.contact || '—', email: user.email, profilePhotoUrl: user.profilePhotoUrl || '' }))];
  }, [apiData.users, createdAccounts]);

  const routeRows = useMemo(() => {
    if (!apiData.routes?.length) {
      const fallbackAreaCodes = {
        'route-1': 'Area 1',
        'route-2': 'Area 1',
        'route-3': 'Area 2A',
        'route-4': 'Area 2B',
        'route-5': 'Area 3',
      };
      return PLACEHOLDER_ROUTES.map((route) => ({ ...route, area: fallbackAreaCodes[route.id] || route.area }));
    }
    return apiData.routes.map((route) => ({ id: route._id, area: routeAreaCode(route), street: routeStreetList(route), collector: route.collectorId?.name || 'Unassigned', date: 'Current schedule', status: route.isActive === false ? 'not collected' : 'collected', flagged: false }));
  }, [apiData.routes]);

  const complaintRows = useMemo(() => {
    if (!apiData.reports?.length) return PLACEHOLDER_COMPLAINTS.map((complaint) => ({ ...complaint, report: complaint }));
    return apiData.reports.map((report) => ({ id: report._id, street: report.description || `${report.barangay || 'Unassigned area'} report`, bags: getReportBagCount(report), time: new Date(report.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), date: new Date(report.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), reporter: report.residentId?.name || 'Resident', status: report.status || 'pending', report }));
  }, [apiData.reports]);

  const formatLoadDimension = (value) => value ? Number(value).toFixed(1) : '—';
  const activityRows = useMemo(() => {
    if (!apiData.loads?.length) return PLACEHOLDER_ACTIVITY;
    return apiData.loads.map((load) => ({ id: load._id, area: routeAreaCode(load.routeId?.name || load.routeId?.routeName || load.routeId?.area || 'Unassigned area'), driver: load.staffId?.name || 'Staff member', truckPlate: load.truckPlate || 'Unknown truck', length: formatLoadDimension(load.length), width: formatLoadDimension(load.width), height: formatLoadDimension(load.height), slope: `${Number(load.slope || 0).toFixed(1)} m³`, tonnage: formatTonnes(load.tonnesEstimate), time: new Date(load.arrivedAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), date: load.arrivedAt ? new Date(load.arrivedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Date unavailable', photoUrl: load.photoUrl || '', notes: load.notes || '' }));
  }, [apiData.loads]);

  const tonnageSeries = useMemo(() => apiData.usingPlaceholder ? [] : buildTonnageSeries(apiData.loads), [apiData.loads, apiData.usingPlaceholder]);
  useMemo(() => activityRows.map((row) => {
    const load = apiData.loads?.find((item) => item._id === row.id);
    row.frontPhotoUrl = load?.sidePhotoUrl || '';
    row.backPhotoUrl = load?.backPhotoUrl || '';
    if (!row.photoUrl) row.photoUrl = row.frontPhotoUrl || row.backPhotoUrl;
    return row;
  }), [activityRows, apiData.loads]);
  const totalTonnage = apiData.tonnage?.totalTonnesEstimate;
  const totalLoads = apiData.tonnage?.count || 0;
  const completionRate = useMemo(() => {
    if (!apiData.compliance?.length) return null;
    const totalStops = apiData.compliance.reduce((sum, row) => sum + (row.totalStops || 0), 0);
    const collectedStops = apiData.compliance.reduce((sum, row) => sum + (row.collected || 0), 0);
    return totalStops ? `${((collectedStops / totalStops) * 100).toFixed(1)}%` : null;
  }, [apiData.compliance]);

  const signOut = () => {
    socketRef.current?.disconnect();
    socketRef.current = null;
    sessionStorage.removeItem('resiklean_admin_token');
    sessionStorage.removeItem('resiklean_admin_user');
    navigate('/login', { replace: true });
  };

  const confirmSignOut = () => {
    setShowLogoutConfirm(false);
    signOut();
  };

  const selectPage = (page) => {
    setSearchParams(page === 'overview' ? {} : { view: page });
  };

  const updateComplaintStatus = async (id, status) => {
    setComplaintUpdateError('');
    const previousReport = apiData.reports?.find((report) => normalizeId(report._id) === normalizeId(id));
    setApiData((current) => ({
      ...current,
      reports: current.reports?.map((report) => normalizeId(report._id) === normalizeId(id) ? { ...report, status } : report) || current.reports,
    }));
    setSelectedComplaint((current) => mergeComplaintRow(current, { reportId: id, status }));

    if (!API_URL || !token || String(id).startsWith('complaint-')) return;

    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to update the complaint status.');

      const payload = { reportId: id, status, report: result.data };
      setApiData((current) => ({ ...current, reports: mergeRealtimeReports(current.reports, payload), usingPlaceholder: false }));
      setSelectedComplaint((current) => mergeComplaintRow(current, payload));
    } catch (error) {
      setApiData((current) => ({
        ...current,
        reports: current.reports?.map((report) => normalizeId(report._id) === normalizeId(id) && previousReport ? previousReport : report) || current.reports,
      }));
      setSelectedComplaint((current) => previousReport ? mergeComplaintRow(current, { reportId: id, report: previousReport }) : current);
      setComplaintUpdateError(error instanceof Error ? error.message : 'Unable to update the complaint status.');
    }
  };

  const createAccount = async (event) => {
    event.preventDefault();
    const account = {
      name: newAccount.name.trim(),
      contact: newAccount.contact.trim(),
      email: newAccount.email.trim(),
      password: newAccount.password,
      role: newAccount.role,
    };

    if (!account.name || !account.email || !account.password || !account.role) {
      setSubmissionState({ loading: false, error: 'Name, email, password, and role are required.', message: '' });
      return;
    }

    if (account.password.length < 6) {
      setSubmissionState({ loading: false, error: 'Password must be at least 6 characters.', message: '' });
      return;
    }

    setSubmissionState({ loading: true, error: '', message: '' });
    const localAccount = { id: `local-${Date.now()}`, name: account.name, role: account.role, area: 'Not assigned', contact: account.contact || '—', email: account.email, profilePhotoUrl: newAccount.avatarPreview };
    try {
      if (API_URL && token) {
        let body;
        const headers = { Authorization: `Bearer ${token}` };

        if (newAccount.avatarFile) {
          body = new FormData();
          body.append('name', account.name);
          body.append('email', account.email);
          body.append('password', account.password);
          body.append('role', account.role);
          if (account.contact) body.append('contact', account.contact);
          body.append('avatar', newAccount.avatarFile);
        } else {
          body = JSON.stringify(account);
          headers['Content-Type'] = 'application/json';
        }

        const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/users`, { method: 'POST', headers, body });
        const responseText = await response.text();
        let result = {};
        try {
          result = responseText ? JSON.parse(responseText) : {};
        } catch {
          throw new Error(`Account API returned ${response.status}. Check that VITE_API_URL points to the backend API.`);
        }

        if (!response.ok || !result.success) throw new Error(result.error || 'Unable to create the account.');
        setCreatedAccounts((current) => [{ ...localAccount, id: result.data?._id || localAccount.id, profilePhotoUrl: result.data?.profilePhotoUrl || localAccount.profilePhotoUrl }, ...current]);
        setSubmissionState({ loading: false, error: '', message: newAccount.avatarFile ? 'Account created with the profile picture.' : 'Account created.' });
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

  useEffect(() => {
    if (!showAccountForm) return undefined;

    const body = document.querySelector('.account-modal form .modal-body');
    if (!body || body.querySelector('[data-account-photo-field]')) return undefined;

    const field = document.createElement('label');
    field.dataset.accountPhotoField = 'true';
    field.textContent = 'Profile picture';

    const picker = document.createElement('div');
    picker.className = 'account-photo-picker';
    const input = document.createElement('input');
    input.accept = 'image/jpeg,image/png,image/webp';
    input.className = 'account-photo-input';
    input.type = 'file';
    input.addEventListener('change', () => {
      const file = input.files?.[0] || null;
      if (file && file.size > 5 * 1024 * 1024) {
        setSubmissionState({ loading: false, error: 'Profile picture must be 5 MB or smaller.', message: '' });
        input.value = '';
        return;
      }
      setNewAccount((current) => ({ ...current, avatarFile: file, avatarPreview: file ? URL.createObjectURL(file) : '' }));
    });
    picker.appendChild(input);
    field.appendChild(picker);
    body.insertBefore(field, body.querySelector('.field-note'));

    return () => field.remove();
  }, [showAccountForm]);

  useEffect(() => {
    if (!selectedActivity?.backPhotoUrl || typeof document === 'undefined') return undefined;
    const body = document.querySelector('.activity-detail-modal .activity-detail-body');
    const original = body?.querySelector('.activity-detail-photo');
    if (!body || !original || body.querySelector('.activity-detail-photo-grid')) return undefined;

    const grid = document.createElement('div');
    grid.className = 'activity-detail-photo-grid';
    [
      { label: 'Front photo', src: selectedActivity.frontPhotoUrl || (!selectedActivity.backPhotoUrl ? selectedActivity.photoUrl : '') },
      { label: 'Back photo', src: selectedActivity.backPhotoUrl },
    ].filter((photo) => photo.src).forEach((photo) => {
      const card = document.createElement('figure');
      card.className = 'activity-detail-photo-card';
      const image = document.createElement('img');
      image.alt = `${photo.label} for ${selectedActivity.area}`;
      image.className = 'activity-detail-photo';
      image.src = photo.src;
      const caption = document.createElement('figcaption');
      caption.textContent = photo.label;
      card.append(image, caption);
      grid.append(card);
    });
    original.replaceWith(grid);
    return undefined;
  }, [selectedActivity]);

  if (!token) return <Navigate replace to="/login" />;

  const overview = <>
    <PageHeader action={<Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary"><Icon name="refresh" size={16} />{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button>} description="Live information from SWMO collection and landfill activity." title="Collection Overview" />
    <div className="metrics-grid">
      <MetricCard caption={completionRate ? 'Across today’s active routes' : 'Live route data unavailable'} icon="route" label="Collection completion" progress={completionRate ? Number.parseFloat(completionRate) : 0} value={completionRate || '—'} />
      <MetricCard caption={apiData.usingPlaceholder ? 'Connect the admin API to view totals' : `${totalLoads} submitted truckload${totalLoads === 1 ? '' : 's'}`} icon="truck" label="Recorded tonnage" tone="teal" trend={tonnageSeries} value={apiData.usingPlaceholder ? '—' : formatTonnes(totalTonnage)} />
      <MetricCard caption="Reports awaiting review" icon="alert" label="Pending complaints" tone="amber" value={String(complaintRows.filter((item) => item.status === 'pending').length)} />
    </div>
    <Card className="chart-card">
      <div className="card-heading-row"><div><h3>Tonnage trend</h3><p>Volume collected per day · {formatTrendRange(tonnageSeries)}</p></div><Button className="outline-button chart-export-button" variant="secondary">Export</Button></div>
      <TonnageChart series={tonnageSeries} />
    </Card>
    <Card className="overview-routes"><div className="card-heading-row overview-route-heading"><div><p className="eyebrow">Collection tracking</p><h3>Recent route activity</h3><p>Street-level collection status</p></div><button className="text-button" onClick={() => selectPage('routes')}>View route history <Icon name="arrow" size={15} /></button></div>{routeRows.slice(0, 4).map((route) => <RoutePreview key={route.id} route={route} />)}<button className="view-more" onClick={() => selectPage('routes')}>View all {routeRows.length} entries <Icon name="arrow" size={15} /></button></Card>
  </>;

  const rhDisplayRows = routeHistoryRows.length ? routeHistoryRows : (routeHistoryLoading ? [] : PLACEHOLDER_ROUTES.map((r) => ({
    id: r.id,
    area: r.area,
    date: r.date,
    street: r.street,
    collector: r.collector,
    truck: { plateNumber: 'NGC-001', truckNumber: 'Isuzu Elf NLR' },
    cycle: { shiftStatus: r.date === '2025-06-28' ? 'day' : 'night', shiftStart: `${r.date}T05:30:00`, shiftEnd: `${r.date}T13:30:00` },
    geofenceEntry: `${r.date}T06:05:00`,
    geofenceExit: r.status === 'not collected' ? null : `${r.date}T12:45:00`,
    flaggedCount: r.flagged ? 1 : 0,
    collected: r.status === 'collected' ? 3 : 1,
    totalStops: 3,
    rowStatus: r.status === 'not collected' ? 'partial' : 'collected',
    segmentStatus: r.status === 'not collected' ? 'Partial' : 'Collected',
  })));

  const routeHistory = <><PageHeader action={<Button className="outline-button" isDisabled={routeHistoryLoading} onPress={loadRouteHistory} variant="secondary"><Icon name="refresh" size={16} />{routeHistoryLoading ? 'Refreshing…' : 'Refresh'}</Button>} description="Completed route collections with geofence-verified entry and exit events" title="Route History" />{routeHistoryError ? <p className="feedback error-feedback">{routeHistoryError}</p> : null}<Card className="table-card route-history-card"><div className="filter-row"><AppSelect aria-label="Filter by collector" onChange={setRhCollectorId} options={routeHistoryFilterCollectors} value={rhCollectorId} /><AppSelect aria-label="Filter by area" onChange={setRhBarangay} options={routeHistoryFilterBarangays} value={rhBarangay} /><input aria-label="Filter from date" onChange={(e) => setRhDateFrom(e.target.value)} type="date" value={rhDateFrom} /><input aria-label="Filter to date" onChange={(e) => setRhDateTo(e.target.value)} type="date" value={rhDateTo} /><AppSelect aria-label="Filter by status" onChange={() => {}} options={[{ label: 'All statuses', value: 'all' }, { label: 'Collected', value: 'collected' }, { label: 'Partial', value: 'partial' }, { label: 'Flagged', value: 'flagged' }, { label: 'Not collected', value: 'notcollected' }]} value="all" /><span className="entries-count">{routeHistoryPagination.total || rhDisplayRows.length} entries</span></div><div className="table-scroll"><table className="standard-data-table admin-data-table route-history-table"><thead><tr><th>Area</th><th>Date</th><th>Street Segment</th><th>Collector</th><th>Truck</th><th className="actions-col">Actions</th></tr></thead><tbody>{routeHistoryLoading ? (<tr><td className="loading-cell" colSpan={6}><Icon name="refresh" size={16} />Loading route history…</td></tr>) : rhDisplayRows.length ? rhDisplayRows.map((row) => {
    const isFlagged = getRhFlaggedCount(row) > 0;
    return (
      <tr key={row.id}>
        <td>{getRhArea(row)}{isFlagged ? <span className="flag">Flagged · {getRhFlaggedCount(row)}</span> : null}</td>
        <td>{row.date || row.eventDate}</td>
        <td>{row.street || row.routeName || '—'}</td>
        <td><AvatarName name={getRhCollectorName(row)} /></td>
        <td><strong>{getRhTruckTitle(row)}</strong>{getRhTruckSubtitle(row) ? <p className="cell-sub">{getRhTruckSubtitle(row)}</p> : null}</td>
        <td className="actions-col"><Button className="outline-button small-button" isDisabled={routeHistoryLoading} onPress={() => void openRouteHistoryDetail(row)} size="sm" variant="secondary">View details</Button></td>
      </tr>
    );
  }) : (<tr><td className="empty-cell" colSpan={6}>No route history records match the current filters.</td></tr>)}</tbody></table></div></Card></>;

  const complaints = <><PageHeader title="Complaint queue" />{complaintUpdateError ? <p className="feedback error-feedback">{complaintUpdateError}</p> : null}<div className="complaint-list">{complaintRows.map((complaint) => <Card className="complaint-card" key={complaint.id}><div className="complaint-art">{complaint.report?.photoUrl || complaint.photoUrl ? <img alt={`Submitted complaint for ${complaint.street}`} src={complaint.report?.photoUrl || complaint.photoUrl} /> : <Icon name="alert" size={24} />}</div><div className="complaint-main"><h3>{complaint.street}</h3><p>{complaint.bags} detected · {complaint.time}</p><button className="complaint-details-button" onClick={() => setSelectedComplaint(complaint)} type="button">View details <Icon name="arrow" size={14} /></button></div><div className="complaint-meta"><span>Date</span><strong>{complaint.date}</strong></div><div className="complaint-meta"><span>Reported by</span><strong>{complaint.reporter}</strong></div><AppSelect aria-label={`Update ${complaint.street} status`} className={`complaint-status status-${complaint.status}`} onChange={(nextStatus) => updateComplaintStatus(complaint.id, nextStatus)} options={[{ label: 'Pending', value: 'pending' }, { label: 'Verified', value: 'verified' }, { label: 'Resolved', value: 'resolved' }, { label: 'Rejected', value: 'rejected' }]} value={complaint.status} /></Card>)}</div>{selectedComplaint ? <ComplaintDetailsModal complaint={selectedComplaint} onClose={() => setSelectedComplaint(null)} /> : null}</>;

  const complaintInbox = <><PageHeader title="Complaint queue" />{complaintUpdateError ? <p className="feedback error-feedback">{complaintUpdateError}</p> : null}<ComplaintInbox complaints={complaintRows} onSelect={setSelectedComplaint} onStatusChange={updateComplaintStatus} realtimeMessagesByReport={realtimeMessagesByReport} selectedComplaint={selectedComplaint} token={token} /></>;

  const activity = <>
    <PageHeader action={<Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary">{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button>} description={apiData.usingPlaceholder ? 'Sample activity while the admin API is unavailable' : `${totalLoads} recorded truckload${totalLoads === 1 ? '' : 's'} · click a submission to view its audit photo`} title="Staff activity log" />
    <Card className="table-card staff-activity-card"><div className="table-scroll"><table className="standard-data-table admin-data-table"><thead><tr><th>Staff submitted</th><th>Area</th><th>L (m)</th><th>W (m)</th><th>H (m)</th><th>Slope</th><th>Tonnage</th></tr></thead><tbody>{activityRows.map((row) => <tr aria-label={`View truckload from ${row.area}`} className="activity-row" key={row.id} onClick={() => row.photoUrl || row.notes ? setSelectedActivity(row) : null} onKeyDown={(event) => { if ((event.key === 'Enter' || event.key === ' ') && (row.photoUrl || row.notes)) { event.preventDefault(); setSelectedActivity(row); } }} tabIndex={row.photoUrl || row.notes ? 0 : undefined}><td><strong>{row.driver}</strong></td><td>{row.area}</td><td>{row.length}</td><td>{row.width}</td><td>{row.height}</td><td>{row.slope}</td><td className="tonnage-cell">{row.tonnage}</td></tr>)}</tbody></table></div></Card>
  </>;

  const assignments = <><PageHeader description="Assign collection routes and registered trucks to each collector" title="Collector assignments" /><RouteAssignmentPanel token={token} /></>;

  const trucks = <><PageHeader description="Register fleet vehicles and review their dimensions" title="Truck management" /><TruckManagementPanel token={token} /></>;

  const accountPage = <Card className="table-card accounts-table-card"><div className="table-scroll"><table className="standard-data-table admin-data-table"><thead><tr><th>Name</th><th>Role</th><th>Assigned area</th><th>Contact</th><th>Email</th><th className="accounts-action-header"><Button className="primary-button accounts-action-button" onPress={() => { setSubmissionState({ loading: false, error: '', message: '' }); setShowAccountForm(true); }}><Icon name="plus" size={16} />Add account</Button></th></tr></thead><tbody>{accountRows.map((account) => <tr key={account.id}><td><AvatarName name={account.name} photoUrl={account.profilePhotoUrl} /></td><td><Chip className={`role-chip role-${account.role}`} size="sm">{titleCase(account.role)}</Chip></td><td>{account.area}</td><td>{account.contact}</td><td>{account.email}</td><td aria-hidden="true" /></tr>)}</tbody></table></div></Card>;

  const pageContent = { overview, routes: routeHistory, complaints: complaintInbox, activity, assignments, accounts: accountPage, trucks }[activePage];
  return <main className="admin-shell"><aside className="admin-sidebar"><div className="brand"><img alt="ResiKlean logo" className="brand-logo" src="/swmo-resiklean-logo.svg" /></div><nav>{NAV_ITEMS.map((item) => <button aria-current={activePage === item.id ? 'page' : undefined} className={activePage === item.id ? 'nav-link active' : 'nav-link'} key={item.id} onClick={() => selectPage(item.id)}><Icon name={item.icon} />{item.label}</button>)}</nav><button className="signout-button" onClick={() => setShowLogoutConfirm(true)}><Icon name="logout" />Sign out</button></aside><section className="admin-workspace"><header className="topbar"><div className="topbar-actions"><button aria-label="Notifications" className="notification-button"><Icon name="bell" size={19} /><i /></button><div className="topbar-avatar">{initials(storedUser.name || 'Admin')}</div><strong className="admin-name">{storedUser.name || 'Admin'}</strong></div></header><section className="dashboard-content">{apiData.usingPlaceholder ? <p className="data-note">Live dashboard data is unavailable. Sample records are shown for the tables; the tonnage chart intentionally stays empty.</p> : null}{pageContent}</section></section>{showAccountForm ? <div className="modal-layer" role="presentation"><div aria-modal="true" className="account-modal" role="dialog"><form onSubmit={createAccount}><div className="modal-header"><div><p className="eyebrow">Account management</p><h2>Add new account</h2></div><button aria-label="Close account form" onClick={() => setShowAccountForm(false)} type="button">×</button></div><div className="modal-body"><label>Full name<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, name: event.target.value }))} placeholder="e.g. Juan dela Cruz" required value={newAccount.name} /></label><label>Contact number<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, contact: event.target.value }))} placeholder="09XXXXXXXXX" value={newAccount.contact} /></label><label>Email address<Input fullWidth onChange={(event) => setNewAccount((current) => ({ ...current, email: event.target.value }))} placeholder="user@nagacity.gov.ph" value={newAccount.email} /></label><label>Temporary password<Input fullWidth minLength="6" onChange={(event) => setNewAccount((current) => ({ ...current, password: event.target.value }))} placeholder="At least 6 characters" required type="password" value={newAccount.password} /></label><label>Role<select onChange={(event) => setNewAccount((current) => ({ ...current, role: event.target.value }))} value={newAccount.role}><option value="collector">Collector</option><option value="staff">Staff</option></select></label><p className="field-note">Contact number is dashboard-only until the backend stores it.</p>{submissionState.error ? <p className="feedback error-feedback">{submissionState.error}</p> : null}</div><div className="modal-footer"><Button className="outline-button" onPress={() => setShowAccountForm(false)} type="button" variant="secondary">Cancel</Button><Button className="primary-button" isDisabled={submissionState.loading} type="submit">{submissionState.loading ? 'Creating…' : 'Create account'}</Button></div></form></div></div> : null}{selectedActivity ? <div className="modal-layer" onClick={() => setSelectedActivity(null)} role="presentation"><div aria-modal="true" className="activity-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Landfill operations</p><h2>Truckload submission</h2></div><button aria-label="Close truckload details" onClick={() => setSelectedActivity(null)} type="button">×</button></div><div className="activity-detail-body">{selectedActivity.photoUrl ? <img alt={`Audit photo for ${selectedActivity.area}`} className="activity-detail-photo" src={selectedActivity.photoUrl} /> : <div className="activity-photo-empty"><Icon name="image" size={28} /><p>No audit photo available</p></div>}<div className="activity-detail-grid"><div><span>Area</span><strong>{selectedActivity.area}</strong></div><div><span>Staff</span><strong>{selectedActivity.driver}</strong></div><div><span>Truck</span><strong>{selectedActivity.truckPlate}</strong></div><div><span>Submitted</span><strong>{selectedActivity.date} · {selectedActivity.time}</strong></div><div><span>Measurements</span><strong>{selectedActivity.length} m × {selectedActivity.width} m × {selectedActivity.height} m</strong></div><div><span>Slope</span><strong>{selectedActivity.slope}</strong></div><div><span>Estimated tonnage</span><strong className="tonnage-cell">{selectedActivity.tonnage}</strong></div></div>{selectedActivity.notes ? <div className="activity-detail-notes"><span>Notes</span><p>{selectedActivity.notes}</p></div> : null}</div><div className="modal-footer"><Button className="outline-button" onPress={() => setSelectedActivity(null)} type="button" variant="secondary">Close</Button></div></div></div> : null}{isRouteHistoryDetailVisible ? (() => {
    const d = selectedRouteHistory;
    const placeholderData = !d ? {
      id: 'sample-id',
      routeName: 'Gen. Luna St., Barangay Triangulo',
      barangay: 'Triangulo',
      eventDate: '2025-06-28',
      collectorName: 'Roel Macaraeg',
      collectorEmployeeId: 'COL-001',
      truckPlate: 'NGA-001',
      truckModel: 'NGC-001 Isuzu Elf NLR',
      shiftStart: '2025-06-28T05:30:00',
      shiftEnd: '2025-06-28T13:30:00',
      geofenceEntryAt: '2025-06-28T06:05:00',
      geofenceExitAt: null,
      flagged: 1,
      collected: 2,
      totalStops: 3,
      status: 'partial',
      referenceId: 'RH-2025-0628-TRI-014',
      reportDate: 'June 28, 2025',
      generatedBy: 'Admin — Ana Lim, SWMO',
      exported: new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Manila' }).format(new Date()).replace(',', ' · ') + ' PHT',
    } : d;
    const data = d || placeholderData;
    const summary = data.recordSummary || {};
    const reference = data.documentReference || {};
    const flaggedCount = Number(data.flaggedCount ?? data.flagged ?? (Array.isArray(data.logs) ? data.logs.filter((log) => log.flaggedForReview).length : 0));
    const segmentStatus = summary.segmentStatus || data.segmentStatus || data.status || 'Partial collection';
    const routeLabel = summary.streetSegment || data.street || data.routeName || '—';
    const areaLabel = reference.area || (getRhArea(data) !== '—' ? `${getRhArea(data)}, Naga City` : 'Naga City');
    const entryTime = summary.geofenceEntry || data.geofenceEntry || data.geofenceEntryAt || null;
    const exitTime = summary.geofenceExit || data.geofenceExit || data.geofenceExitAt || null;
    const shiftStart = summary.shiftStart || getRhShiftStart(data);
    const shiftEnd = summary.shiftEnd || getRhShiftEnd(data);
    const collectorName = summary.collectorName || getRhCollectorName(data);
    const collectorSubtitle = summary.collectorSubtitle || `${data.collectorEmployeeId || 'COL-001'} · SWMO Naga City`;
    const truckAssigned = summary.truckAssigned || `${getRhTruckSubtitle(data) || 'No truck recorded'}${getRhTruckTitle(data) !== '—' ? ` · Plate No. ${getRhTruckTitle(data)}` : ''}`;
    const isIncomplete = /flag|partial|not collect/i.test(String(segmentStatus)) || !exitTime || flaggedCount > 0;
    const stopLogs = Array.isArray(data.logs) ? data.logs : Array.isArray(data.stopLogs) ? data.stopLogs : [];
    const trailCoordinates = mapCoordinateList(data.trailPoints);
    const routeGeometry = data.route?.routePath;
    const expectedCoordinates = routeGeometry?.type === 'LineString'
      ? mapCoordinateList(routeGeometry.coordinates)
      : routeGeometry?.type === 'MultiLineString'
        ? routeGeometry.coordinates.flatMap((line) => mapCoordinateList(line))
        : [];
    const mapBounds = [...expectedCoordinates, ...trailCoordinates];
    const trailPolyline = projectRouteCoordinates(trailCoordinates, 620, 280, mapBounds);
    const expectedPolyline = projectRouteCoordinates(expectedCoordinates, 620, 280, mapBounds);
    const parseSvgPoint = (value) => value ? value.split(',').map(Number) : null;
    const trailStartPoint = parseSvgPoint(trailPolyline ? trailPolyline.split(' ')[0] : null);
    const trailEndPoint = parseSvgPoint(trailPolyline ? trailPolyline.split(' ').at(-1) : null);
    return (
      <div className="modal-layer modal-layer-wide" role="presentation" onClick={() => setIsRouteHistoryDetailVisible(false)}>
        <div aria-modal="true" className="activity-detail-modal route-history-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="modal-header">
            <div>
              <p className="eyebrow">NAGA CITY SOLID WASTE MANAGEMENT OFFICE · GEOFENCE-VERIFIED</p>
              <h2>Route History Report</h2>
              <p className="modal-subtitle">{routeLabel} · {areaLabel} · {data.eventDate || data.date || reference.reportDate || '—'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Button className="route-history-export-button" isDisabled={isExportingPdf || routeDetailLoading} onPress={() => void exportRouteHistoryPDF()} type="button" variant="primary">
                <Icon name={isExportingPdf ? 'refresh' : 'inbox'} size={16} />
                <span>{isExportingPdf ? 'Exporting PDF…' : 'Export to PDF'}</span>
              </Button>
              <button aria-label="Close route history details" onClick={() => setIsRouteHistoryDetailVisible(false)} type="button">×</button>
            </div>
          </div>
          <div className="modal-body route-history-modal-body">
            {routeDetailError ? <p className="feedback error-feedback">{routeDetailError}</p> : null}
            {routeDetailLoading ? <div style={{ padding: 48, textAlign: 'center' }}><Icon name="refresh" size={24} />Loading route record…</div> : (
              <>
                <div className="rh-two-col">
                  <section className="rh-col">
                    <h3 className="rh-section-label">RECORD SUMMARY</h3>
                    <div className="detail-table-web">
                      <div className="dt-row"><span className="dt-label">Street Segment</span><span className="dt-value">{routeLabel}</span></div>
                      <div className="dt-row"><span className="dt-label">Collector Name</span><span className="dt-value"><strong>{collectorName}</strong><br /><span style={{ color: '#718279', fontSize: 11 }}>{collectorSubtitle}</span></span></div>
                      <div className="dt-row"><span className="dt-label">Truck Assigned</span><span className="dt-value">{truckAssigned}</span></div>
                      <div className="dt-row dt-row-split">
                        <div className="dt-cell"><span className="dt-label">Shift Start</span><span className="dt-value">{shiftStart || new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(placeholderData.shiftStart)).replace(',', '')}</span></div>
                        <div className="dt-cell"><span className="dt-label">Shift End</span><span className="dt-value">{shiftEnd || new Intl.DateTimeFormat('en-PH', { hour: 'numeric', minute: '2-digit', hour12: true, month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(placeholderData.shiftEnd)).replace(',', '')}</span></div>
                      </div>
                      <div className="dt-row dt-row-split">
                        <div className="dt-cell"><span className="dt-label">Geofence Entry</span><span className="dt-value">{typeof entryTime === 'string' && !entryTime.includes('T') ? entryTime : formatRHShiftTime(entryTime)}</span></div>
                        <div className="dt-cell"><span className="dt-label">Geofence Exit</span><span className="dt-value dt-value-red">{typeof exitTime === 'string' && !exitTime.includes('T') ? exitTime : exitTime ? formatRHShiftTime(exitTime) : 'Not logged — no exit event recorded'}</span></div>
                      </div>
                      <div className="dt-row"><span className="dt-label">Segment Status</span><span className={`dt-value ${isIncomplete ? 'dt-value-red' : 'dt-value-green'}`}><strong>{segmentStatus}</strong></span></div>
                    </div>
                  </section>
                  <section className="rh-col rh-col-ref">
                    <h3 className="rh-section-label">DOCUMENT REFERENCE</h3>
                    <div className="detail-table-web detail-table-ref-web">
                      <div className="dt-row"><span className="dt-label">REFERENCE ID</span><span className="dt-value dt-mono">{reference.referenceId || data.referenceId || `RH-${(data.eventDate || '0000-00-00').replace(/-/g, '').slice(0, 4)}-${(data.eventDate || '').replace(/-/g, '').slice(4)}-${String(getRhArea(data) || 'UNK').slice(0, 3).toUpperCase()}-001`}</span></div>
                      <div className="dt-row"><span className="dt-label">REPORT DATE</span><span className="dt-value">{reference.reportDate || data.reportDate || new Intl.DateTimeFormat('en-PH', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' }).format(new Date(data.eventDate || Date.now()))}</span></div>
                      <div className="dt-row"><span className="dt-label">AREA</span><span className="dt-value">{areaLabel}</span></div>
                      <div className="dt-row"><span className="dt-label">STATUS</span><span className={`dt-value ${isIncomplete ? 'dt-value-red dt-value-bold' : 'dt-value-green dt-value-bold'}`}>{reference.status || segmentStatus}</span></div>
                      <div className="dt-row"><span className="dt-label">GENERATED BY</span><span className="dt-value">{reference.generatedBy || data.generatedBy || `${storedUser.role === 'collector' ? 'Collector' : 'Admin'} — ${storedUser.name || 'Unknown'}, SWMO`}</span></div>
                      <div className="dt-row"><span className="dt-label">EXPORTED</span><span className="dt-value">{reference.exportedAt || data.exported || new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Manila' }).format(new Date()).replace(',', ' · ') + ' PHT'}</span></div>
                    </div>
                  </section>
                </div>
                <section className="rh-segment-section">
                  <h3 className="rh-section-label">SEGMENT TRAIL</h3>
                  <div className="rh-trail-panel">
                    <div className="rh-trail-diagram">
                      <svg viewBox="0 0 620 280" xmlns="http://www.w3.org/2000/svg">
                        <defs>
                          <pattern id="rhGrid" height="30" patternUnits="userSpaceOnUse" width="30">
                            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#dbe4de" strokeWidth="0.7" />
                          </pattern>
                        </defs>
                        <rect fill="#f3f9f5" height="280" width="620" />
                        <rect fill="url(#rhGrid)" height="280" width="620" />
                        <text fill="#6d7d74" fontFamily="system-ui" fontSize="10" x="70" y="55">Peñafrancia Ave.</text>
                        <text fill="#6d7d74" fontFamily="system-ui" fontSize="10" x="230" y="145">Gen. Luna St.</text>
                        <text fill="#6d7d74" fontFamily="system-ui" fontSize="10" x="80" y="235">Elias Angeles St.</text>
                        <line stroke="#a4b3aa" strokeDasharray="6 4" strokeWidth="0.9" x1="220" x2="220" y1="20" y2="260" />
                        <line stroke="#a4b3aa" strokeDasharray="6 4" strokeWidth="0.9" x1="420" x2="420" y1="20" y2="260" />
                        <line stroke="#a4b3aa" strokeDasharray="6 4" strokeWidth="0.9" x1="30" x2="600" y1="75" y2="75" />
                        <line stroke="#a4b3aa" strokeDasharray="6 4" strokeWidth="0.9" x1="30" x2="600" y1="195" y2="195" />
                        {expectedPolyline ? <polyline fill="none" points={expectedPolyline} stroke="#9ca9a2" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" /> : null}
                        {trailPolyline ? <polyline fill="none" points={trailPolyline} stroke="#c53030" strokeLinecap="round" strokeLinejoin="round" strokeWidth="5" /> : <text fill="#6d7d74" fontFamily="system-ui" fontSize="12" textAnchor="middle" x="310" y="145">No GPS trail recorded</text>}
                        {trailStartPoint ? (
                          <g transform={`translate(${trailStartPoint[0]} ${trailStartPoint[1]})`}>
                            <circle cx="0" cy="0" fill="#c53030" r="8" stroke="#ffffff" strokeWidth="2" />
                            <text fill="#c53030" fontFamily="system-ui" fontSize="9" fontWeight="700" x="-20" y="-16">Entry</text>
                          </g>
                        ) : null}
                        {trailEndPoint && trailEndPoint.join(',') !== trailStartPoint?.join(',') ? (
                          <g transform={`translate(${trailEndPoint[0]} ${trailEndPoint[1]})`}>
                            <circle cx="0" cy="0" fill="#ffffff" r="7" stroke="#c53030" strokeWidth="2.5" />
                            <text fill="#c53030" fontFamily="system-ui" fontSize="9" fontWeight="700" x="-15" y="-16">Exit</text>
                          </g>
                        ) : null}
                        <text fill="#6d7d74" fontFamily="system-ui" fontSize="9" textAnchor="end" x="605" y="270">N ↑</text>
                      </svg>
                    </div>
                    <div className="rh-legend-panel">
                      <h4 className="rh-legend-title">LEGEND</h4>
                      <div className="rh-legend-row"><span className="rh-legend-line-solid" /><span>Truck path — covered</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-line-dashed" /><span>Expected path — not covered</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-dot rh-legend-entry" /><span>Entry time: {typeof entryTime === 'string' && !entryTime.includes('T') ? entryTime : formatRHShiftTime(entryTime)}</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-dot rh-legend-exit" /><span className={!exitTime ? 'dt-value-red' : ''}>Exit: {typeof exitTime === 'string' && !exitTime.includes('T') ? exitTime : exitTime ? formatRHShiftTime(exitTime) : 'Not recorded'}</span></div>
                      {flaggedCount > 0 ? (<div className="rh-legend-row"><svg height="12" viewBox="0 0 24 24" width="12"><path d="M4 15V4m0 11 0 6M6 4h11l-2 4 2 4H6" fill="none" stroke="#c53030" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg><span>Dwell: No exit event — segment flagged ({flaggedCount})</span></div>) : null}
                    </div>
                  </div>
                  <p className="rh-fig-caption">Fig. 1 — Segment traced via on-device geofencing. Red solid line: truck path. Dashed: uncovered portion.</p>
                </section>
                {stopLogs.length ? (
                  <section className="rh-stop-logs">
                    <h3 className="rh-section-label">STOP LOGS</h3>
                    <div className="rh-stop-log-list">
                      {stopLogs.map((log, i) => (
                        <div className="rh-stop-card" key={`${log.stopId || 'stop'}-${i}`}>
                          <span className={`rh-stop-bar ${log.flaggedForReview ? 'rh-stop-flagged' : 'rh-stop-done'}`} />
                          <div style={{ flex: 1 }}>
                            <div className="rh-stop-row">
                              <strong>{log.stopName || `Stop #${i + 1}`}</strong>
                              {log.flaggedForReview ? <span className="rh-stop-badge-flag">Flagged</span> : null}
                            </div>
                            <p className="rh-stop-meta">
                              {formatRHShiftTime(log.collectedAt)} — {log.exitedAt ? formatRHShiftTime(log.exitedAt) : 'No exit'}
                              {typeof log.dwellSeconds === 'number' ? ` · ${log.dwellSeconds}s dwell` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}
              </>
            )}
          </div>
          <div className="modal-footer">
            <Button className="outline-button" onPress={() => setIsRouteHistoryDetailVisible(false)} type="button" variant="secondary">Close</Button>
          </div>
        </div>
      </div>
    );
  })() : null}{showLogoutConfirm ? <LogoutConfirmation onCancel={() => setShowLogoutConfirm(false)} onConfirm={confirmSignOut} /> : null}</main>;
}
