import NotificationsPage from './NotificationsPage.jsx';
import AnnouncementsPage from './AnnouncementsPage.jsx';
import OverviewMetrics from '../components/overview/OverviewMetrics.jsx';
import useNotifications from '../components/useNotifications.js';
import { DisabledControls, LoadingRegion, LoadingTableBody, SkeletonChart, SkeletonDetails, SkeletonStat } from '../components/Skeleton.jsx';
import SettingsPage from './SettingsPage.jsx';
import useTablePagination from '../components/useTablePagination.js';
import { Button, Card, Chip } from '@heroui/react';
import { Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import { createPortal } from 'react-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PageHeader from '../components/PageHeader.jsx';
import ComplaintQueueView from '../components/ComplaintQueueView.jsx';
import AccountModal from '../components/AccountModal.jsx';
import TruckloadSubmissionDialog from '../components/TruckloadSubmissionDialog.jsx';
import TablePagination from '../components/TablePagination.jsx';
import AccountIdentityButton from '../components/AccountIdentityButton.jsx';
import { NotificationNav, SidebarAccount } from '../components/SidebarUtilities.jsx';
import AppSelect from '../components/AppSelect.jsx';
import AppDatePicker from '../components/AppDatePicker.jsx';
import TruckManagementPanel from '../components/TruckManagementPanel.jsx';
import RouteManagementPanel from '../components/RouteManagementPanel.jsx';
import RouteAssignmentPanel from '../components/RouteAssignmentPanel.jsx';
import TonnageExportPopover from '../components/TonnageExportPopover.jsx';
import ExpandableRouteText from '../components/ExpandableRouteText.jsx';
import RouteHistoryTrail from '../components/RouteHistoryTrail.jsx';
import TonnageDateFilter from '../components/TonnageDateFilter.jsx';
import { tonnagePreset, tonnageRangeLabel } from '../components/tonnageDates';
import { translate, usePreferences } from '../components/preferences.jsx';

const EMPTY_TONNAGE_SERIES = [];
const API_URL = import.meta.env.VITE_API_URL;
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || API_URL?.replace(/\/api\/?$/, '');

const NAV_ITEMS = [
  { id: 'overview', label: 'Overview', icon: 'grid' },
  { id: 'routes', label: 'Route History', icon: 'route' },
  { id: 'complaints', label: 'Complaints', icon: 'alert' },
  { id: 'announcements', label: 'Announcements', icon: 'megaphone' },
  { id: 'activity', label: 'Waste Generation', icon: 'chart' },
  { id: 'manage-routes', label: 'Manage Routes', icon: 'map' },
  { id: 'assignments', label: 'Driver Assignments', icon: 'operations' },
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

const EMPTY_ACCOUNT = { name: '', contact: '', email: '', password: '', role: 'collector', birthday: '', avatarFile: null, avatarPreview: '', idFile: null, idPreview: '' };

function initials(name = '') {
  return name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'A';
}

function titleCase(value = '') {
  if (value === 'collector') return 'Driver';
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
    megaphone: <><path d="M3 10v4h4l12 5V5L7 10H3Zm4 4 2 7h3l-2-6M22 9v6" /></>,
    grid: <><rect height="7" rx="1.5" width="7" x="3" y="3" /><rect height="7" rx="1.5" width="7" x="14" y="3" /><rect height="7" rx="1.5" width="7" x="3" y="14" /><rect height="7" rx="1.5" width="7" x="14" y="14" /></>,
    route: <><circle cx="6" cy="18" r="2" /><circle cx="18" cy="6" r="2" /><path d="M8 18h3a3 3 0 0 0 3-3v-3a3 3 0 0 1 3-3h1" /></>,
    alert: <><path d="M10.3 3.7 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4m0 4h.01" /></>,
    chart: <><path d="M4 19V5m0 14h16" /><path d="m7 15 4-4 3 2 5-6" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
    account: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
    'id-card': <><rect height="16" rx="2" width="18" x="3" y="4" /><circle cx="8" cy="10" r="2" /><path d="M13 9h5M13 13h5" /></>,
    operations: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="2" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></>,
    map: <><path d="m9 18-6 3V6l6-3 6 3 6-3v15l-6 3-6-3Z" /><path d="M9 3v15M15 6v15" /></>,
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

function MetricCard({ icon, label, value, caption, tone = 'green', trend = [], progress, loading, hasData, error, onRetry }) {
  const progressValue = Math.max(0, Math.min(100, Number(progress || 0)));
  const chartColor = tone === 'teal' ? '#078e78' : tone === 'amber' ? '#d39a21' : '#07815f';
  return <Card className="metric-card"><div className={`metric-icon metric-${tone}`}><Icon name={icon} size={16} /></div><div className="metric-content"><p className="metric-label">{label}</p><LoadingRegion loading={loading} hasData={hasData} error={error} onRetry={onRetry} placeholder={<SkeletonStat/>}><strong className="metric-value">{value}</strong><p className="metric-caption">{caption}</p></LoadingRegion>{progress !== undefined ? <div aria-label={`${progressValue}% complete`} className="metric-progress"><span style={{ width: `${progressValue}%` }} /></div> : null}</div>{trend.length > 1 ? <MetricSparkline color={chartColor} data={trend} /> : null}</Card>;
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
          <Button variant="tertiary" aria-label="Close complaint details" onPress={onClose} type="button">×</Button>
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

function ComplaintInbox({ complaints, selectedComplaint, onSelect, onStatusChange, realtimeMessagesByReport, token, loading, connected, error, hasData, onRetry }) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [messages, setMessages] = useState([]);
  const [messageDraft, setMessageDraft] = useState('');
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [messageError, setMessageError] = useState('');
  const [messageRetry, setMessageRetry] = useState(0);
  const filteredComplaints = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return complaints.filter((complaint) => {
      const report = complaint.report || complaint;
      const reporter = report.residentId?.name || complaint.reporter || 'Resident';
      return (!normalizedQuery || [reporter, complaint.street, report.description, report.barangay].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery))) && (statusFilter === 'all' || complaint.status === statusFilter);
    });
  }, [complaints, query, statusFilter]);

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
  }, [activeComplaint?.id, token, messageRetry]);

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

  return <ComplaintQueueView {...{ filteredComplaints, activeComplaint, report, reporter, status, photoUrl, query, setQuery, statusFilter, setStatusFilter, onSelect, onStatusChange, messages, messageDraft, setMessageDraft, isLoadingMessages, isSendingMessage, messageError, sendMessage, loading, connected, error, hasData, onRetry }} onRetryMessages={() => setMessageRetry(value => value + 1)} formatDate={formatReportDate} />;
}

function LogoutConfirmation({ onCancel, onConfirm }) {
  return <div className="modal-layer" onClick={onCancel} role="presentation"><div aria-modal="true" className="account-modal logout-confirm-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Account</p><h2>Sign out?</h2></div><Button variant="tertiary" aria-label="Close sign-out confirmation" onPress={onCancel} type="button">×</Button></div><div className="modal-body"><p className="field-note">Are you sure you want to sign out of the admin dashboard?</p></div><div className="modal-footer"><Button className="outline-button" onPress={onCancel} type="button" variant="secondary">Cancel</Button><Button variant="tertiary" className="logout-confirm-button" onPress={onConfirm} type="button">Sign out</Button></div></div></div>;
}

function formatManilaSubmissionDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
}

function manilaDateBoundary(value, endOfDay = false) {
  if (!value) return null;
  return new Date(`${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}+08:00`);
}

function formatContactNumber(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '—';
  if (digits.length === 11 && digits.startsWith('09')) return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  return String(value);
}

function AccountsToolbarPortal({ children }) {
  const [target, setTarget] = useState(null);
  useEffect(() => {
    setTarget(document.querySelector('.accounts-table-card'));
  }, []);
  return target ? createPortal(children, target) : null;
}

function ActivityToolbar({ area, areas, from, onAreaChange, onClear, onFromChange, onQueryChange, onToChange, query, to, invalidRange }) {
  return <div className="activity-toolbar"><label className="activity-search"><Icon name="search" size={16} /><input aria-label="Search waste generation" onChange={(event) => onQueryChange(event.target.value)} placeholder="Search waste generation" type="search" value={query} /></label><AppSelect aria-label="Filter waste generation by area" onChange={onAreaChange} options={[{ label: 'All activity areas', value: 'all' }, ...areas.map((value) => ({ label: value, value }))]} value={area} /><AppDatePicker label="From" ariaLabel="From date submitted" onChange={onFromChange} value={from} isInvalid={invalidRange} /><AppDatePicker label="To" ariaLabel="To date submitted" onChange={onToChange} value={to} isInvalid={invalidRange} />{invalidRange ? <p className="activity-date-error" role="alert">From date must be before or equal to To date.</p> : null}<Button variant="tertiary" aria-label="Clear waste generation filters" className="activity-clear-filter" onPress={onClear} type="button">Clear</Button></div>;
}

export default function Dashboard() {
  const { preferences } = usePreferences();
  const tr = value => translate(value, preferences.language);
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const token = sessionStorage.getItem('resiklean_admin_token');
  const [storedUser, setStoredUser] = useState(() => JSON.parse(sessionStorage.getItem('resiklean_admin_user') || '{}'));
  const location = useLocation();
  const updateOwnProfile = useCallback(user => {
    sessionStorage.setItem('resiklean_admin_user', JSON.stringify(user));
    setStoredUser(user);
  }, []);
  const requestedPage = searchParams.get('view');
  const activePage = location.pathname === '/notifications' ? 'notifications' : location.pathname === '/settings' ? 'settings' : NAV_ITEMS.some((item) => item.id === requestedPage) ? requestedPage : 'overview';
  const notificationFeed = useNotifications({ token, apiUrl: API_URL });
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
  const historyRequest = useRef(0);
  const routeDetailTarget = useRef(null);
  const routeDetailRequest = useRef(0);
  const [routeHistoryPagination, setRouteHistoryPagination] = useState({ total: 0, page: 1, limit: 7, totalPages: 1 });
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
  const [rhQuery, setRhQuery] = useState('');
  const [rhSearchQuery, setRhSearchQuery] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => {
      setRhSearchQuery(rhQuery.trim());
      setRouteHistoryPagination(current => current.page === 1 ? current : { ...current, page: 1 });
    }, 300);
    return () => clearTimeout(timer);
  }, [rhQuery]);
  const [rhStatus, setRhStatus] = useState('all');
  const [accountQuery, setAccountQuery] = useState('');
  const [accountRole, setAccountRole] = useState('all');
  const [activityQuery, setActivityQuery] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageSize, setActivityPageSize] = useState(7);
  const [activityArea, setActivityArea] = useState('all');
  const [activityDateFrom, setActivityDateFrom] = useState('');
  const [activityDateTo, setActivityDateTo] = useState('');
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [tonnageRange, setTonnageRange] = useState(() => tonnagePreset());
  const [trendResult, setTrendResult] = useState({ loading: true, series: [], error: '' });
  const [trendRetry, setTrendRetry] = useState(0);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const socketRef = useRef(null);
  const [complaintsConnected, setComplaintsConnected] = useState(false);
  const [realtimeMessagesByReport, setRealtimeMessagesByReport] = useState({});
  const [apiData, setApiData] = useState({ users: null, routes: null, reports: null, loads: null, tonnage: null, usingPlaceholder: true });

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
    if (!token || !API_URL) return undefined;
    let active = true;
    const refreshAccounts = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/users`, { headers: { Authorization: `Bearer ${token}` } });
        const result = await response.json();
        if (active && response.ok && result.success) setApiData(current => ({ ...current, users: result.data?.users || [] }));
      } catch { /* Retain the last account list while offline. */ }
    };
    window.addEventListener('focus', refreshAccounts);
    const timer = window.setInterval(refreshAccounts, 30000);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener('focus', refreshAccounts); };
  }, [token]);


  useEffect(() => {
    if (!token || !SOCKET_URL) return undefined;

    const socket = io(SOCKET_URL, { auth: { token } });
    socketRef.current = socket;
    const markConnected = () => { setComplaintsConnected(true); window.dispatchEvent(new Event('resiklean:notifications-changed')); };
    const markDisconnected = () => setComplaintsConnected(false);
    socket.on('connect', markConnected);
    socket.on('disconnect', markDisconnected);

    const handleComplaintEvent = (payload) => {
      window.dispatchEvent(new Event('resiklean:notifications-changed'));
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
      window.dispatchEvent(new Event('resiklean:notifications-changed'));
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
      socket.off('connect', markConnected);
      socket.off('disconnect', markDisconnected);
      setComplaintsConnected(false);
      socket.off('complaint:created', handleComplaintEvent);
      socket.off('complaint:status-updated', handleComplaintEvent);
      socket.off('complaint:message-created', handleMessageEvent);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
    };
  }, [token]);

  const loadRouteHistory = useCallback(async () => {
    if (!API_URL || !token) return;
    const request = ++historyRequest.current;
    if (rhDateFrom && rhDateTo && rhDateFrom > rhDateTo) {
      setRouteHistoryLoading(false);
      setRouteHistoryPagination(current => ({ ...current, total: 0, page: 1, totalPages: 1 }));
      setRouteHistoryError('The From date must be earlier than or equal to the To date.');
      setRouteHistoryRows([]);
      return;
    }
    setRouteHistoryLoading(true);
    setRouteHistoryError('');
    try {
      const params = new URLSearchParams();
      if (rhCollectorId !== 'all') params.set('collectorId', rhCollectorId);
      if (rhBarangay !== 'all') params.set('barangay', rhBarangay);
      if (rhDateFrom) params.set('from', rhDateFrom);
      if (rhDateTo) params.set('to', rhDateTo);
      if (rhSearchQuery) params.set('q', rhSearchQuery);
      if (rhStatus !== 'all') params.set('status', rhStatus);
      params.set('page', String(routeHistoryPagination.page));
      params.set('limit', String(routeHistoryPagination.limit));
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/route-history?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (request !== historyRequest.current) return;
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load route history.');
      setRouteHistoryRows(Array.isArray(result.data?.rows) ? result.data.rows : []);
      setRouteHistoryPagination({
        page: Math.min(Number(result.data?.page || routeHistoryPagination.page), Math.max(1, Number(result.data?.pages || 1))),
        limit: Number(result.data?.limit || routeHistoryPagination.limit),
        total: Number(result.data?.count || 0),
        totalPages: Number(result.data?.pages || 1),
      });
    } catch (error) {
      if (request !== historyRequest.current) return;
      setRouteHistoryPagination(current => ({ ...current, total: 0, totalPages: 1 }));
      setRouteHistoryRows([]);
      setRouteHistoryError(error instanceof Error ? error.message : 'Unable to load route history.');
    } finally {
      if (request === historyRequest.current) setRouteHistoryLoading(false);
    }
  }, [API_URL, rhSearchQuery, rhStatus, rhBarangay, rhCollectorId, rhDateFrom, rhDateTo, routeHistoryPagination.limit, routeHistoryPagination.page, token]);

  const loadRouteHistoryDetail = useCallback(async (id) => {
    if (!API_URL || !token || !id) return null;
    const request = ++routeDetailRequest.current;
    setRouteDetailLoading(true);
    setRouteDetailError('');
    try {
      const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/route-history/${encodeURIComponent(id)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load route history detail.');
      if (request !== routeDetailRequest.current) return null;
      setSelectedRouteHistory(result.data || null);
      return result.data || null;
    } catch (error) {
      if (request !== routeDetailRequest.current) return null;
      const msg = error instanceof Error ? error.message : 'Unable to load route history detail.';
      setRouteDetailError(msg);
      return null;
    } finally {
      if (request === routeDetailRequest.current) setRouteDetailLoading(false);
    }
  }, [API_URL, token]);

  useEffect(() => {
    if (!isRouteHistoryDetailVisible) {
      routeDetailRequest.current += 1;
      setRouteDetailLoading(false);
    }
  }, [isRouteHistoryDetailVisible]);

  const openRouteHistoryDetail = useCallback(async (row) => {
    routeDetailTarget.current = row?.id;
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

  const routeHistoryFilterCollectors = useMemo(() => [{ label: 'All drivers', value: 'all' }, ...(apiData.users?.filter((u) => u.role === 'collector').map((u) => ({ label: u.name, value: u._id })) || [])], [apiData.users]);
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
  const getRhCollectorName = (row) => row?.collector || row?.collectorName || row?.collectorId?.name || 'Unknown';
  const getRhArea = (row) => row?.area || row?.barangay || '—';
  const getRhEntry = (row) => row?.geofenceEntry || row?.geofenceEntryAt || null;
  const getRhExit = (row) => row?.geofenceExit || row?.geofenceExitAt || null;
  const getRhShiftStart = (row) => row?.cycle?.shiftStart || row?.shiftStart || null;
  const getRhShiftEnd = (row) => row?.cycle?.shiftEnd || row?.shiftEnd || null;
  const getRhTruckTitle = (row) => row?.truck?.plateNumber || row?.truckPlate || '—';
  const getRhTruckSubtitle = (row) => [row?.truck?.truckNumber, row?.truck?.color].filter(Boolean).join(' · ') || row?.truckModel || '';

  const accountRows = useMemo(() => {
    if (!apiData.users) return [...createdAccounts, ...PLACEHOLDER_ACCOUNTS];
    return [...createdAccounts.filter(account => !apiData.users.some(user => user._id === account.id)), ...apiData.users.filter((user) => ['collector', 'staff', 'admin'].includes(user.role)).map((user) => ({ id: user._id, name: user.name, role: user.role, area: (apiData.routes || []).filter((route) => normalizeId(route.collectorId) === user._id).map(routeAreaCode).join(', ') || 'Not assigned', contact: user.phone ?? user.contact ?? '—', email: user.email, profilePhotoUrl: user.profilePhotoUrl || '', shift: user.shift || '', assignedRoute: (apiData.routes || []).filter(route => route.isActive !== false && (normalizeId(route.collectorId) === user._id || normalizeId(user.assignedRouteId) === route._id)).map(route => route.name).filter(Boolean).join(', ') }))];
  }, [apiData.users, apiData.routes, createdAccounts]);

  const filteredAccountRows = useMemo(() => {
    const query = accountQuery.trim().toLowerCase();
    return accountRows.filter((account) => {
      const matchesQuery = !query || [account.name, titleCase(account.role), account.area, account.contact, account.email].some((value) => String(value || '').toLowerCase().includes(query));
      return matchesQuery && (accountRole === 'all' || account.role === accountRole);
    });
  }, [accountQuery, accountRole, accountRows]);

  const accountPagination = useTablePagination(filteredAccountRows, JSON.stringify([accountQuery, accountRole]));

  const routeRows = useMemo(() => {
    if (apiData.routes === null) {
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
    if (apiData.reports === null) return PLACEHOLDER_COMPLAINTS.map((complaint) => ({ ...complaint, report: complaint }));
    return apiData.reports.map((report) => ({ id: report._id, street: report.description || `${report.barangay || 'Unassigned area'} report`, bags: getReportBagCount(report), time: new Date(report.createdAt).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' }), date: new Date(report.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }), reporter: report.residentId?.name || 'Resident', status: report.status || 'pending', report }));
  }, [apiData.reports]);

  const formatLoadDimension = (value) => value ? Number(value).toFixed(1) : '—';
  const activityRows = useMemo(() => {
    if (!apiData.loads?.length) return [];
    return apiData.loads.map((load) => ({ id: load._id, area: routeAreaCode(load.routeId?.name || load.routeId?.routeName || load.routeId?.area || 'Unassigned area'), driver: load.staffId?.name || 'Staff member', truckNumber: load.truckNumber || '—', truckPlate: load.truckPlate || 'Unknown truck', length: formatLoadDimension(load.length), width: formatLoadDimension(load.width), height: formatLoadDimension(load.height), slope: `${Number(load.slope || 0).toFixed(1)} m³`, tonnage: formatTonnes(load.tonnesEstimate), submittedAt: load.arrivedAt || null, time: load.arrivedAt ? formatManilaSubmissionDate(load.arrivedAt).split(', ').at(-1) : '—', date: formatManilaSubmissionDate(load.arrivedAt), photoUrl: load.photoUrl || '', notes: load.notes || '' })).sort((left, right) => (right.submittedAt ? new Date(right.submittedAt).getTime() : -Infinity) - (left.submittedAt ? new Date(left.submittedAt).getTime() : -Infinity));
  }, [apiData.loads]);

  const activityAreas = useMemo(() => [...new Set(activityRows.map((row) => row.area).filter(Boolean))].sort(), [activityRows]);
  const filteredActivityRows = useMemo(() => {
    const query = activityQuery.trim().toLowerCase();
    const from = manilaDateBoundary(activityDateFrom);
    const to = manilaDateBoundary(activityDateTo, true);
    return activityRows.filter((row) => {
      const submittedAt = row.submittedAt ? new Date(row.submittedAt) : null;
      return (!query || [row.truckNumber, row.driver, row.area, row.truckPlate, row.date].some((value) => String(value || '').toLowerCase().includes(query))) && (activityArea === 'all' || row.area === activityArea) && (!from || (submittedAt && submittedAt >= from)) && (!to || (submittedAt && submittedAt <= to));
    });
  }, [activityArea, activityDateFrom, activityDateTo, activityQuery, activityRows]);

  useEffect(() => { setActivityPage(1); }, [activityQuery, activityArea, activityDateFrom, activityDateTo, activityPageSize]);

  const recentTonnageSeries = useMemo(() => apiData.usingPlaceholder ? [] : buildTonnageSeries(apiData.loads), [apiData.loads, apiData.usingPlaceholder]);
  const trendStart = tonnageRange.start.toString();
  const trendEnd = tonnageRange.end.toString();
  useEffect(() => {
    if (!token || storedUser.role !== 'admin' || activePage !== 'overview') return undefined;
    const controller = new AbortController();
    let active = true;
    const timer = setTimeout(() => controller.abort(), 15000);
    setTrendResult({ loading: true, series: [], error: '' });
    (async () => {
      try {
        if (!API_URL) throw new Error('Connect the admin API to view tonnage.');
        const query = new URLSearchParams({ start: trendStart, end: trendEnd });
        const response = await fetch(`${API_URL.replace(/\/$/, '')}/admin/reports/tonnage-trend?${query}`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data?.chartData)) throw new Error(result.error || 'Unable to load the tonnage trend.');
        const series = result.data.chartData.map(item => ({ date: new Date(`${item.date}T12:00:00`), tonnes: Number(item.tonnage) || 0 }));
        if (active) setTrendResult({ loading: false, series, error: '', start: trendStart, end: trendEnd, count: result.data.summary?.truckLoads || 0 });
      } catch (error) {
        if (active) setTrendResult({ loading: false, series: [], error: error.name === 'AbortError' ? 'Loading took too long. Please retry.' : error.message });
      } finally { clearTimeout(timer); }
    })();
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [token, storedUser.role, activePage, trendStart, trendEnd, trendRetry, apiData.loads]);
  const trendLoading = trendResult.loading || (!trendResult.error && (trendResult.start !== trendStart || trendResult.end !== trendEnd));
  const tonnageSeries = trendLoading ? EMPTY_TONNAGE_SERIES : trendResult.series;
  useMemo(() => activityRows.map((row) => {
    const load = apiData.loads?.find((item) => item._id === row.id);
    row.frontPhotoUrl = load?.sidePhotoUrl || '';
    row.backPhotoUrl = load?.backPhotoUrl || '';
    if (!row.photoUrl) row.photoUrl = row.frontPhotoUrl || row.backPhotoUrl;
    return row;
  }), [activityRows, apiData.loads]);
  const totalTonnage = apiData.tonnage?.totalTonnesEstimate;
  const totalLoads = apiData.tonnage?.count || 0;

  const tonnageStats = useMemo(() => ({
    dailyAverage: tonnageSeries.length ? tonnageSeries.reduce((total, item) => total + item.tonnes, 0) / tonnageSeries.length : 0,
  }), [tonnageSeries]);

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
    if (location.pathname !== '/dashboard') navigate(page === 'overview' ? '/dashboard' : `/dashboard?view=${page}`);
    else setSearchParams(page === 'overview' ? {} : { view: page });
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
      birthday: newAccount.birthday,
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
    const localAccount = { id: `local-${Date.now()}`, name: account.name, role: account.role, area: 'Not assigned', contact: account.contact || '—', email: account.email, profilePhotoUrl: '' };
    try {
      if (API_URL && token) {
        let body;
        const headers = { Authorization: `Bearer ${token}` };

        if (newAccount.avatarFile || newAccount.idFile) {
          body = new FormData();
          body.append('name', account.name);
          body.append('email', account.email);
          body.append('password', account.password);
          body.append('role', account.role);
          if (account.contact) body.append('contact', account.contact);
          if (account.birthday) body.append('birthday', account.birthday);
          if (newAccount.avatarFile) body.append('avatar', newAccount.avatarFile);
          if (newAccount.idFile) body.append('idPhoto', newAccount.idFile);
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
        throw new Error('Connect to the backend before creating an account.');
      }
      setNewAccount(EMPTY_ACCOUNT);
      setShowAccountForm(false);
    } catch (error) {
      setSubmissionState({ loading: false, message: '', error: error instanceof Error ? error.message : 'Unable to create the account.' });
    }
  };

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('sidebar-is-collapsed', isSidebarCollapsed);
    return () => document.body.classList.remove('sidebar-is-collapsed');
  }, [isSidebarCollapsed]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;
    document.body.classList.toggle('mobile-sidebar-is-open', isMobileSidebarOpen);
    const closeWhenViewportExpands = () => {
      if (window.innerWidth > 640) setIsMobileSidebarOpen(false);
    };
    window.addEventListener('resize', closeWhenViewportExpands);
    return () => {
      window.removeEventListener('resize', closeWhenViewportExpands);
      document.body.classList.remove('mobile-sidebar-is-open');
    };
  }, [isMobileSidebarOpen]);

  const dashboardLoadError = !isRefreshing && apiData.usingPlaceholder ? 'Live dashboard data is unavailable.' : '';
  const metricLoading = { loading: isRefreshing, hasData: apiData.tonnage !== null, error: dashboardLoadError, onRetry: refreshDashboard };

  const overview = <>
    <PageHeader action={<Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary"><Icon name="refresh" size={16} />{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button>} description="Live information from SWMO collection and landfill activity." title="Collection Overview" />
    <div className="metrics-grid">
      <MetricCard loading={trendLoading} hasData={Boolean(trendResult.start)} error={trendResult.error} onRetry={() => setTrendRetry(value => value + 1)} caption={`Across the selected ${Math.round((tonnageRange.end.toDate('Asia/Manila') - tonnageRange.start.toDate('Asia/Manila')) / 86400000) + 1} days`} icon="chart" label="Daily average" value={tonnageSeries.length ? formatTonnes(tonnageStats.dailyAverage) : '—'} />
      <MetricCard {...metricLoading} caption={apiData.usingPlaceholder ? 'Connect the admin API to view totals' : `${totalLoads} submitted truckload${totalLoads === 1 ? '' : 's'}`} icon="truck" label="Recorded tonnage" tone="teal" trend={recentTonnageSeries} value={apiData.usingPlaceholder ? '—' : formatTonnes(totalTonnage)} />
      <MetricCard {...metricLoading} caption="Reports awaiting review" icon="alert" label="Pending complaints" tone="amber" value={String(complaintRows.filter((item) => item.status === 'pending').length)} />
    </div>
    <div className="tonnage-overview-grid">
      <Card className="chart-card tonnage-trend-card">
        <div className="card-heading-row">
          <div>
            <h3>Tonnage trend</h3>
            <p>Volume collected per day · {tonnageRangeLabel(tonnageRange)}</p>
          </div>
          <DisabledControls disabled={trendLoading}><div className="tonnage-heading-actions">
            <TonnageDateFilter loading={trendLoading} value={tonnageRange} onChange={setTonnageRange} />
          <TonnageExportPopover range={tonnageRange}
            onExport={async (start, end) => {
              const token = sessionStorage.getItem('resiklean_admin_token');
              if (!token) return;
              try {
                const res = await fetch(`${API_URL.replace(/\/$/, '')}/admin/reports/tonnage-trend/pdf?start=${start}&end=${end}`, {
                  headers: { Authorization: `Bearer ${token}` }
                });
                if (!res.ok) {
                  const errorData = await res.json().catch(() => null);
                  throw new Error(errorData?.error || 'Failed to generate PDF');
                }
                const blob = await res.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `Tonnage-Trend-Report-${start}-to-${end}.pdf`;
                document.body.appendChild(a);
                a.click();
                a.remove();
                window.URL.revokeObjectURL(url);
              } catch (err) {
                alert('Error exporting PDF: ' + err.message);
                throw err;
              }
            }} 
          />
          </div></DisabledControls>
        </div>
        <LoadingRegion loading={trendLoading} hasData={Boolean(trendResult.start)} error={trendResult.error} onRetry={() => setTrendRetry(value => value + 1)} placeholder={<SkeletonChart/>}>
          {!trendResult.count ? <div className="chart-empty"><Icon name="chart" size={24}/><p>No truckloads in this date range.</p><span>Choose another range to view recorded collections.</span></div> : <TonnageChart series={tonnageSeries}/>}
        </LoadingRegion>
      </Card>
    </div>
    <OverviewMetrics token={token} />
    <Card className="overview-routes"><div className="card-heading-row overview-route-heading"><div><p className="eyebrow">Collection tracking</p><h3>Recent route activity</h3><p>Street-level collection status</p></div><Button type="button" variant="tertiary" className="text-button" onPress={() => selectPage('routes')}>View route history <Icon name="arrow" size={15} /></Button></div><LoadingRegion loading={isRefreshing} hasData={apiData.routes !== null} error={dashboardLoadError} onRetry={refreshDashboard} placeholder={<SkeletonDetails rows={4}/>}>{routeRows.slice(0, 4).map((route) => <RoutePreview key={route.id} route={route} />)}</LoadingRegion><Button type="button" variant="tertiary" className="view-more" onPress={() => selectPage('routes')}>View all {routeRows.length} entries <Icon name="arrow" size={15} /></Button></Card>
  </>;

  const rhDisplayRows = routeHistoryRows;
  const changeHistoryFilter = (setter, value) => {
    setter(value);
    setRouteHistoryPagination(current => ({ ...current, page: 1 }));
  };

  if (!token || storedUser.role !== 'admin') return <Navigate replace to="/login" />;

  const routeHistory = <><PageHeader action={<Button className="outline-button" isDisabled={routeHistoryLoading} onPress={loadRouteHistory} variant="secondary"><Icon name="refresh" size={16} />{routeHistoryLoading ? 'Refreshing…' : 'Refresh'}</Button>} description="Completed route collections with geofence-verified entry and exit events" title="Route History" /><Card className="table-card route-history-card"><div className="filter-row"><label className="route-history-search-wrapper"><Icon name="search" size={17} /><input aria-label="Search route history" onChange={event => setRhQuery(event.target.value)} placeholder="Search area, street, driver, or truck" type="search" value={rhQuery} /></label><AppSelect aria-label="Filter by driver" onChange={value => changeHistoryFilter(setRhCollectorId, value)} options={routeHistoryFilterCollectors} value={rhCollectorId} /><AppSelect aria-label="Filter by area" onChange={value => changeHistoryFilter(setRhBarangay, value)} options={routeHistoryFilterBarangays} value={rhBarangay} /><div className="route-history-date-range" role="group" aria-label="Collection date range"><AppDatePicker label="From date" ariaLabel="Filter from date" hideLabel onChange={value => changeHistoryFilter(setRhDateFrom, value)} value={rhDateFrom} /><AppDatePicker label="To date" ariaLabel="Filter to date" hideLabel onChange={value => changeHistoryFilter(setRhDateTo, value)} value={rhDateTo} /></div><AppSelect aria-label="Filter by status" onChange={value => changeHistoryFilter(setRhStatus, value)} options={[{ label: 'All statuses', value: 'all' }, { label: 'Collected', value: 'collected' }, { label: 'Partial', value: 'partial' }, { label: 'Flagged', value: 'flagged' }, { label: 'Not collected', value: 'notcollected' }]} value={rhStatus} /><span className="entries-count">{routeHistoryPagination.total} entries</span></div><div className="table-scroll"><table className="standard-data-table admin-data-table route-history-table"><thead><tr><th>Area</th><th>Date</th><th>Street Segment</th><th>Driver</th><th>Truck</th><th className="actions-col">Actions</th></tr></thead><LoadingTableBody loading={routeHistoryLoading} hasData={routeHistoryRows.length > 0} error={routeHistoryError} onRetry={loadRouteHistory} rows={routeHistoryPagination.limit} columns={6}>{rhDisplayRows.length ? rhDisplayRows.map((row) => {
    return (
      <tr key={row.id}>
        <td>{row.routeName || '—'}</td>
        <td>{row.date || row.eventDate}</td>
        <td>{getRhArea(row)}</td>
        <td><AvatarName name={getRhCollectorName(row)} /></td>
        <td><strong>{getRhTruckTitle(row)}</strong>{getRhTruckSubtitle(row) ? <p className="cell-sub">{getRhTruckSubtitle(row)}</p> : null}</td>
        <td className="actions-col"><Button className="outline-button small-button" isDisabled={routeHistoryLoading} onPress={() => void openRouteHistoryDetail(row)} size="sm" variant="secondary">View details</Button></td>
      </tr>
    );
  }) : (<tr><td className="empty-cell" colSpan={6}>No route history records match the current filters.</td></tr>)}</LoadingTableBody></table></div><TablePagination label="Route history" page={routeHistoryPagination.page} pageSize={routeHistoryPagination.limit} total={routeHistoryPagination.total} disabled={routeHistoryLoading} onPageChange={page => setRouteHistoryPagination(current => ({ ...current, page }))} onPageSizeChange={limit => setRouteHistoryPagination(current => ({ ...current, limit, page: 1 }))} /></Card></>;

  const complaints = <><PageHeader title="Complaint queue" />{complaintUpdateError ? <p className="feedback error-feedback">{complaintUpdateError}</p> : null}<div className="complaint-list">{complaintRows.map((complaint) => <Card className="complaint-card" key={complaint.id}><div className="complaint-art">{complaint.report?.photoUrl || complaint.photoUrl ? <img alt={`Submitted complaint for ${complaint.street}`} src={complaint.report?.photoUrl || complaint.photoUrl} /> : <Icon name="alert" size={24} />}</div><div className="complaint-main"><h3>{complaint.street}</h3><p>{complaint.bags} detected · {complaint.time}</p><Button variant="tertiary" className="complaint-details-button" onPress={() => setSelectedComplaint(complaint)} type="button">View details <Icon name="arrow" size={14} /></Button></div><div className="complaint-meta"><span>Date</span><strong>{complaint.date}</strong></div><div className="complaint-meta"><span>Reported by</span><strong>{complaint.reporter}</strong></div><AppSelect aria-label={`Update ${complaint.street} status`} className={`complaint-status status-${complaint.status}`} onChange={(nextStatus) => updateComplaintStatus(complaint.id, nextStatus)} options={[{ label: 'Pending', value: 'pending' }, { label: 'Verified', value: 'verified' }, { label: 'Resolved', value: 'resolved' }, { label: 'Rejected', value: 'rejected' }]} value={complaint.status} /></Card>)}</div>{selectedComplaint ? <ComplaintDetailsModal complaint={selectedComplaint} onClose={() => setSelectedComplaint(null)} /> : null}</>;

  const complaintInbox = <><PageHeader title="Complaint queue" />{complaintUpdateError ? <p className="feedback error-feedback">{complaintUpdateError}</p> : null}<ComplaintInbox loading={isRefreshing} error={dashboardLoadError} hasData={apiData.reports !== null} onRetry={refreshDashboard} connected={complaintsConnected} complaints={complaintRows} onSelect={setSelectedComplaint} onStatusChange={updateComplaintStatus} realtimeMessagesByReport={realtimeMessagesByReport} selectedComplaint={selectedComplaint} token={token} /></>;

  const activityDateRangeInvalid = Boolean(activityDateFrom && activityDateTo && activityDateFrom > activityDateTo);
  const activityTotal = activityDateRangeInvalid ? 0 : filteredActivityRows.length;
  const currentActivityPage = Math.min(activityPage, Math.max(1, Math.ceil(activityTotal / activityPageSize)));
  const pagedActivityRows = filteredActivityRows.slice((currentActivityPage - 1) * activityPageSize, currentActivityPage * activityPageSize);
  const activity = <>
    <PageHeader action={<Button className="outline-button" isDisabled={isRefreshing} onPress={refreshDashboard} variant="secondary">{isRefreshing ? 'Refreshing…' : 'Refresh data'}</Button>} description={apiData.usingPlaceholder ? 'Sample waste generation data while the admin API is unavailable' : `${totalLoads} recorded truckload${totalLoads === 1 ? '' : 's'} · use View details to view a submission`} title="Waste Generation" />
    <DisabledControls disabled={isRefreshing}><ActivityToolbar area={activityArea} areas={activityAreas} from={activityDateFrom} invalidRange={activityDateRangeInvalid} onAreaChange={setActivityArea} onClear={() => { setActivityQuery(''); setActivityArea('all'); setActivityDateFrom(''); setActivityDateTo(''); }} onFromChange={setActivityDateFrom} onQueryChange={setActivityQuery} onToChange={setActivityDateTo} query={activityQuery} to={activityDateTo} /></DisabledControls>
    <Card className="table-card staff-activity-card"><div className="table-scroll"><table className="standard-data-table admin-data-table">
      <thead><tr><th scope="col">Truck number</th><th scope="col">Date submitted</th><th scope="col">Area</th><th scope="col">Slope</th><th scope="col">Tonnage</th><th scope="col" className="activity-actions">Actions</th></tr></thead>
      <LoadingTableBody loading={isRefreshing} hasData={apiData.loads !== null} error={dashboardLoadError} onRetry={refreshDashboard} rows={activityPageSize} columns={6}>{activityDateRangeInvalid ? <tr><td className="empty-cell" colSpan={6}>Choose a valid date range.</td></tr> : activityTotal ? pagedActivityRows.map((row) => <tr className="activity-row" key={row.id}>
        <td title={row.truckNumber}><strong>{row.truckNumber}</strong></td><td title={row.date}>{row.date}</td><td title={row.area}>{row.area}</td><td>{row.slope}</td><td className="tonnage-cell">{row.tonnage}</td>
        <td className="activity-actions"><Button className="outline-button small-button" size="sm" variant="secondary" aria-label={`View truckload from ${row.area}`} onPress={() => setSelectedActivity(row)}>View details</Button></td>
      </tr>) : <tr><td className="empty-cell" colSpan={6}>No submitted truckloads match the current filters.</td></tr>}</LoadingTableBody>
    </table></div><TablePagination disabled={isRefreshing} page={currentActivityPage} pageSize={activityPageSize} total={activityTotal} onPageChange={setActivityPage} onPageSizeChange={setActivityPageSize} /></Card>
  </>;

  const assignments = <><PageHeader description="Assign collection routes and registered trucks to each driver" title="Driver assignments" /><RouteAssignmentPanel token={token} /></>;

  const trucks = <><PageHeader description="Register fleet vehicles and review their dimensions" title="Truck management" /><TruckManagementPanel token={token} /></>;
  const manageRoutes = <><PageHeader description="Trace collection paths and maintain ordered collection stops." title="Route management" /><RouteManagementPanel token={token} /></>;

  const accountPage = <Card className="table-card accounts-table-card"><div className="table-scroll"><table className="standard-data-table admin-data-table"><thead><tr><th>Name</th><th>Role</th><th>Assigned area</th><th>Contact</th><th>Email</th><th className="accounts-profile-actions" scope="col">Actions</th></tr></thead><LoadingTableBody loading={isRefreshing} hasData={apiData.users !== null} error={dashboardLoadError} onRetry={refreshDashboard} variant="accounts" rows={accountPagination.controls.pageSize} columns={6}>{accountPagination.rows.map((account) => <tr key={account.id}><td><AvatarName name={account.name} photoUrl={account.profilePhotoUrl} /></td><td><Chip className={`role-chip role-${account.role}`} size="sm">{titleCase(account.role)}</Chip></td><td>{account.area}</td><td>{formatContactNumber(account.contact)}</td><td>{account.email}</td><td className="accounts-profile-actions"><AccountIdentityButton account={account} token={token} apiUrl={API_URL} /></td></tr>)}{!filteredAccountRows.length ? <tr><td colSpan={6} className="empty-cell">No accounts match the current filters.</td></tr> : null}</LoadingTableBody></table></div><TablePagination disabled={isRefreshing} label="Manage accounts" {...accountPagination.controls} /></Card>;

  const accountsToolbar = <AccountsToolbarPortal><DisabledControls disabled={isRefreshing}><div className="accounts-toolbar"><div className="navigation-tools"><label><Icon name="search" size={16} /><input aria-label="Search accounts" placeholder="Search accounts" type="search" value={accountQuery} onChange={event => setAccountQuery(event.target.value)} /></label><AppSelect aria-label="All account roles" value={accountRole} onChange={setAccountRole} options={[{ label: 'All account roles', value: 'all' }, { label: 'Admin', value: 'admin' }, { label: 'Driver', value: 'collector' }, { label: 'Staff', value: 'staff' }]} /></div><Button className="primary-button accounts-action-button" onPress={() => { setSubmissionState({ loading: false, error: '', message: '' }); setShowAccountForm(true); }}><Icon name="plus" size={16} />Add account</Button></div></DisabledControls></AccountsToolbarPortal>;
  const openNotification = async (item, record) => {
    if (item.type === 'route') {
      await openRouteHistoryDetail({ id: item.targetId });
    } else if (item.type === 'truckload') {
      setApiData(current => ({ ...current, loads: [...(current.loads || []).filter(load => load._id !== record._id), record] }));
      setSelectedActivity({ id: record._id, area: record.routeId?.name || 'Unassigned area', driver: record.staffId?.name || 'Staff member', truckNumber: record.truckNumber || '—', truckPlate: record.truckPlate, tonnage: formatTonnes(record.tonnesEstimate), submittedAt: record.arrivedAt, notes: record.notes || '', slope: record.slope, length: record.length, width: record.width, height: record.height });
    } else {
      setApiData(current => ({ ...current, reports: [...(current.reports || []).filter(report => report._id !== record._id), record] }));
      setSelectedComplaint({ id: record._id, street: record.description, reporter: record.residentId?.name || 'Resident', status: record.status || 'pending', report: record });
      navigate('/dashboard?view=complaints');
    }
  };
  const pageContent = { announcements: <AnnouncementsPage token={token} />, notifications: <NotificationsPage feed={notificationFeed} Icon={Icon} onOpen={openNotification} />, settings: <SettingsPage user={storedUser} token={token} onUserChange={updateOwnProfile} />, overview, routes: routeHistory, complaints: complaintInbox, activity, 'manage-routes': manageRoutes, assignments, accounts: <><PageHeader title="Manage accounts" />{accountsToolbar}{accountPage}</>, trucks }[activePage];
  return <main className="admin-shell">{createPortal(<><Button isIconOnly variant="ghost" className="sidebar-collapse-toggle" aria-label={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} title={isSidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={isSidebarCollapsed} onPress={() => setIsSidebarCollapsed(value => !value)}><span className="sidebar-collapse-toggle-icon" aria-hidden="true">{isSidebarCollapsed ? '›' : '‹'}</span></Button><Button isIconOnly variant="ghost" className="mobile-sidebar-toggle" aria-label={isMobileSidebarOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={isMobileSidebarOpen} onPress={() => setIsMobileSidebarOpen(value => !value)}><span className="mobile-sidebar-toggle-icon" aria-hidden="true">{isMobileSidebarOpen ? '×' : '☰'}</span></Button><Button variant="ghost" className="mobile-sidebar-backdrop" aria-label="Close navigation" onPress={() => setIsMobileSidebarOpen(false)} /></>, document.body)}<aside className="admin-sidebar"><div className="brand"><img alt="ResiKlean logo" className="brand-logo brand-logo-full" src="/swmo-resiklean-logo.svg" /><img alt="ResiKlean logo" className="brand-logo brand-logo-mark" src="/resiklean-sidebar-mark.svg" /></div><nav>{NAV_ITEMS.map((item) => <Button type="button" variant="tertiary" data-page-link aria-label={tr(item.label)} aria-current={activePage === item.id ? 'page' : undefined} className={activePage === item.id ? 'nav-link active' : 'nav-link'} key={item.id} title={tr(item.label)} onPress={() => { selectPage(item.id); setIsMobileSidebarOpen(false); }}><Icon name={item.icon} /><span className="sidebar-label">{tr(item.label)}</span></Button>)}<NotificationNav count={notificationFeed.data?.unread ?? null} loading={notificationFeed.loading} error={notificationFeed.error} active={activePage === 'notifications'} Icon={Icon} onOpen={() => { navigate('/notifications'); setIsMobileSidebarOpen(false); }} /></nav><SidebarAccount user={storedUser} Icon={Icon} settingsActive={activePage === 'settings'} onSettings={() => { navigate('/settings'); window.scrollTo(0, 0); setIsMobileSidebarOpen(false); }} onSignOut={() => { setIsMobileSidebarOpen(false); setShowLogoutConfirm(true); }} /></aside><section className="admin-workspace"><section className="dashboard-content">{apiData.usingPlaceholder && !isRefreshing && activePage !== 'settings' && activePage !== 'notifications' ? <p className="data-note">Live dashboard data is unavailable. Retry the affected section.</p> : null}{pageContent}</section></section><AccountModal isOpen={showAccountForm} onClose={() => setShowAccountForm(false)} account={newAccount} setAccount={setNewAccount} submission={submissionState} setSubmission={setSubmissionState} onSubmit={createAccount} />{selectedActivity ? <TruckloadSubmissionDialog activity={selectedActivity} load={apiData.loads?.find(load => load._id === selectedActivity.id)} onClose={() => setSelectedActivity(null)} /> : null}{isRouteHistoryDetailVisible ? (() => {
    const d = selectedRouteHistory;
    const data = d || {};
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
    const collectorSubtitle = 'SWMO Naga City';
    const truckAssigned = summary.truckAssigned || `${getRhTruckSubtitle(data) || 'No truck recorded'}${getRhTruckTitle(data) !== '—' ? ` · Plate No. ${getRhTruckTitle(data)}` : ''}`;
    const isIncomplete = /flag|partial|not collect/i.test(String(segmentStatus)) || !exitTime || flaggedCount > 0;
    const stopLogs = Array.isArray(data.logs) ? data.logs : Array.isArray(data.stopLogs) ? data.stopLogs : [];
    return (
      <div className="modal-layer modal-layer-wide" role="presentation" onClick={() => setIsRouteHistoryDetailVisible(false)}>
        <div aria-modal="true" className="activity-detail-modal route-history-detail-modal" onClick={(event) => event.stopPropagation()} role="dialog">
          <div className="modal-header">
            <div>
              <p className="eyebrow">NAGA CITY SOLID WASTE MANAGEMENT OFFICE · GEOFENCE-VERIFIED</p>
              <h2>Route History Report</h2>
              <p className="modal-subtitle"><ExpandableRouteText key={data.id} text={data.route?.name || data.routeName || routeLabel} limit={100} /> · {areaLabel} · {data.eventDate || data.date || reference.reportDate || '—'}</p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <Button className="route-history-refresh-button" size="sm" variant="secondary" isDisabled={routeDetailLoading} onPress={() => void loadRouteHistoryDetail(routeDetailTarget.current)}>
                <Icon name="refresh" size={16} />{routeDetailLoading ? 'Refreshing...' : 'Refresh trail'}
              </Button>
              <Button className="route-history-export-button" isDisabled={isExportingPdf || routeDetailLoading} onPress={() => void exportRouteHistoryPDF()} type="button" variant="primary">
                <Icon name={isExportingPdf ? 'refresh' : 'inbox'} size={16} />
                <span>{isExportingPdf ? 'Exporting PDF…' : 'Export to PDF'}</span>
              </Button>
              <Button variant="tertiary" aria-label="Close route history details" onPress={() => setIsRouteHistoryDetailVisible(false)} type="button">×</Button>
            </div>
          </div>
          <div className="modal-body route-history-modal-body">

            <LoadingRegion loading={routeDetailLoading} hasData={Boolean(d?.recordSummary)} error={routeDetailError} onRetry={() => void loadRouteHistoryDetail(routeDetailTarget.current)} placeholder={<SkeletonDetails rows={8}/>}>{!d ? <p>Unable to display this record.</p> : (
              <>
                <div className="rh-two-col">
                  <section className="rh-col">
                    <h3 className="rh-section-label">RECORD SUMMARY</h3>
                    <div className="detail-table-web">
                      <div className="dt-row"><span className="dt-label">Street Segment</span><span className="dt-value"><ExpandableRouteText key={data.id} text={routeLabel} /></span></div>
                      <div className="dt-row"><span className="dt-label">Driver Name</span><span className="dt-value"><strong>{collectorName}</strong><br /><span style={{ color: '#718279', fontSize: 11 }}>{collectorSubtitle}</span></span></div>
                      <div className="dt-row"><span className="dt-label">Truck Assigned</span><span className="dt-value">{truckAssigned}</span></div>
                      <div className="dt-row dt-row-split">
                        <div className="dt-cell"><span className="dt-label">Shift Start</span><span className="dt-value">{shiftStart || 'Not recorded'}</span></div>
                        <div className="dt-cell"><span className="dt-label">Shift End</span><span className="dt-value">{shiftEnd || 'Not recorded'}</span></div>
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
                      <div className="dt-row"><span className="dt-label">GENERATED BY</span><span className="dt-value">{reference.generatedBy || data.generatedBy || `${storedUser.role === 'collector' ? 'Driver' : 'Admin'} — ${storedUser.name || 'Unknown'}, SWMO`}</span></div>
                      <div className="dt-row"><span className="dt-label">EXPORTED</span><span className="dt-value">{reference.exportedAt || data.exported || new Intl.DateTimeFormat('en-PH', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Manila' }).format(new Date()).replace(',', ' · ') + ' PHT'}</span></div>
                    </div>
                  </section>
                </div>
                <section className="rh-segment-section">
                  <h3 className="rh-section-label">SEGMENT TRAIL</h3>
                  <div className="rh-trail-panel">
                    <RouteHistoryTrail key={data.id} data={data} />
                    <div className="rh-legend-panel">
                      <h4 className="rh-legend-title">LEGEND</h4>
                      <div className="rh-legend-row"><span className="rh-legend-line-solid" /><span>Recorded driver travel</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-line-dashed" /><span>Assigned route (planned)</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-dot rh-legend-entry" /><span>Entry time: {typeof entryTime === 'string' && !entryTime.includes('T') ? entryTime : formatRHShiftTime(entryTime)}</span></div>
                      <div className="rh-legend-row"><span className="rh-legend-dot rh-legend-exit" /><span className={!exitTime ? 'dt-value-red' : ''}>Exit: {typeof exitTime === 'string' && !exitTime.includes('T') ? exitTime : exitTime ? formatRHShiftTime(exitTime) : 'Not recorded'}</span></div>
                      {flaggedCount > 0 ? (<div className="rh-legend-row"><svg height="12" viewBox="0 0 24 24" width="12"><path d="M4 15V4m0 11 0 6M6 4h11l-2 4 2 4H6" fill="none" stroke="#c53030" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" /></svg><span>Dwell: No exit event — segment flagged ({flaggedCount})</span></div>) : null}
                    </div>
                  </div>
                  <p className="rh-fig-caption">Red: uploaded GPS travel. Dashed: assigned route. The assigned line does not indicate which stops were collected.</p>
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
            )}</LoadingRegion>
          </div>
          <div className="modal-footer">
            <Button className="outline-button" onPress={() => setIsRouteHistoryDetailVisible(false)} type="button" variant="secondary">Close</Button>
          </div>
        </div>
      </div>
    );
  })() : null}{showLogoutConfirm ? <LogoutConfirmation onCancel={() => setShowLogoutConfirm(false)} onConfirm={confirmSignOut} /> : null}</main>;
}
