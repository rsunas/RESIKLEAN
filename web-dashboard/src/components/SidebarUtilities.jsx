import { Button, Popover } from '@heroui/react';
import { useState } from 'react';

export function NotificationNav({ reports, loading, unavailable, onReview, onRefresh, Icon }) {
  const [open, setOpen] = useState(false);
  const pending = (reports || []).filter(report => (report.status || 'pending') === 'pending')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const count = pending.length;
  return <Popover isOpen={open} onOpenChange={setOpen}>
    <Button className="nav-link sidebar-notifications" aria-label={`Notifications, ${count} pending reports`} title="Notifications" variant="ghost">
      <Icon name="bell" /><span className="sidebar-label">Notifications</span>
      <span className="notification-count" aria-hidden="true">{count > 99 ? '99+' : count}</span>
    </Button>
    <Popover.Content placement="right top" offset={16} className="sidebar-popover notification-panel">
      <Popover.Dialog aria-label="Notifications">
        <div className="sidebar-panel-heading"><div><Popover.Heading>Notifications</Popover.Heading><p>Complaint reports awaiting review</p></div><Button isIconOnly aria-label="Close notifications" variant="ghost" onPress={() => setOpen(false)}>×</Button></div>
        {loading ? <p className="sidebar-panel-message" role="status">Updating notifications…</p> : null}
        {unavailable ? <p className="sidebar-panel-message" role="status">Notifications are temporarily unavailable.</p> : null}
        {!loading && !unavailable && !count ? <div className="notification-empty"><Icon name="bell" /><strong>You're all caught up</strong><p>No complaints are awaiting review.</p></div> : null}
        <div className="notification-list">{pending.map(report => <button key={report._id} className="notification-item" onClick={() => { setOpen(false); onReview(report); }}>
          <span className="notification-item-icon"><Icon name="alert" /></span><span><strong>{report.barangay || 'New complaint report'}</strong><span>{report.description || 'A resident report needs your review.'}</span><small>{report.createdAt ? new Date(report.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Awaiting review'}</small></span>
        </button>)}</div>
        <div className="sidebar-panel-footer"><Button variant="ghost" isDisabled={loading} onPress={onRefresh}>Refresh</Button><Button variant="secondary" onPress={() => { setOpen(false); onReview(); }}>View complaints</Button></div>
      </Popover.Dialog>
    </Popover.Content>
  </Popover>;
}

export function SidebarAccount({ user, onSignOut, Icon }) {
  const [open, setOpen] = useState(false);
  const name = user.name || 'Admin';
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const role = (user.role || 'Administrator').replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return <div className="sidebar-account-area"><Popover isOpen={open} onOpenChange={setOpen}>
    <Button className="sidebar-account" aria-label={`${name}, account options`} title={`${name} · ${role}`} variant="ghost">
      <span className="sidebar-avatar" aria-hidden="true">{initials}</span><span className="sidebar-account-copy sidebar-label"><strong>{name}</strong><small>{role}</small></span><span className="sidebar-account-chevron" aria-hidden="true">⌃</span>
    </Button>
    <Popover.Content placement="right bottom" offset={16} className="sidebar-popover account-panel"><Popover.Dialog aria-label="Account options">
      <Popover.Heading>{name}</Popover.Heading><p>{role}</p>
      <Button className="account-signout" variant="ghost" onPress={() => { setOpen(false); onSignOut(); }}><Icon name="logout" />Sign out</Button>
    </Popover.Dialog></Popover.Content>
  </Popover></div>;
}