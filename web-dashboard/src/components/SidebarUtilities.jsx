import { Skeleton, useLoadingPresentation } from './Skeleton.jsx';
import { Button, Dropdown, Popover } from '@heroui/react';
import { useState } from 'react';
import { SettingsAvatar, SettingsIcon } from './SettingsDialogs.jsx';

export function NotificationNav({ reports, loading, unavailable, onReview, onRefresh, Icon }) {
  const [open, setOpen] = useState(false);
  const pending = (reports || []).filter(report => (report.status || 'pending') === 'pending')
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const count = pending.length;
  const badge = useLoadingPresentation({ loading, hasData: reports !== null, error: !loading && unavailable ? 'Notifications unavailable' : '' });
  return <Popover isOpen={open} onOpenChange={setOpen}>
    <Button className="nav-link sidebar-notifications" aria-label={`Notifications, ${count} pending reports`} title="Notifications" variant="ghost">
      <Icon name="bell" /><span className="sidebar-label">Notifications</span>
      <span aria-busy={badge.busy} className={badge.initial && !badge.visible ? 'skeleton-waiting' : ''}>{badge.initial ? <><span className="skeleton-sr-only">Loading notifications</span><Skeleton variant="circle" width={24} height={24}/></> : <span className="notification-count" aria-hidden="true">{badge.failure && reports === null ? '—' : count > 99 ? '99+' : count}</span>}</span>
    </Button>
    <Popover.Content placement="right top" offset={16} className="sidebar-popover notification-panel">
      <Popover.Dialog aria-label="Notifications">
        <div className="sidebar-panel-heading"><div><Popover.Heading>Notifications</Popover.Heading><p>Complaint reports awaiting review</p></div><Button isIconOnly aria-label="Close notifications" variant="ghost" onPress={() => setOpen(false)}>×</Button></div>
        {loading ? <p className="sidebar-panel-message" role="status">Updating notifications…</p> : null}
        {unavailable || badge.failure ? <p className="sidebar-panel-message" role="status">Notifications are temporarily unavailable.</p> : null}
        {!loading && !unavailable && !count ? <div className="notification-empty"><Icon name="bell" /><strong>You're all caught up</strong><p>No complaints are awaiting review.</p></div> : null}
        <div className="notification-list">{pending.map(report => <Button type="button" variant="tertiary" key={report._id} className="notification-item" onPress={() => { setOpen(false); onReview(report); }}>
          <span className="notification-item-icon"><Icon name="alert" /></span><span><strong>{report.barangay || 'New complaint report'}</strong><span>{report.description || 'A resident report needs your review.'}</span><small>{report.createdAt ? new Date(report.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Awaiting review'}</small></span>
        </Button>)}</div>
        <div className="sidebar-panel-footer"><Button variant="ghost" isDisabled={loading && !badge.failure} onPress={() => { badge.retry(); onRefresh(); }}>{badge.failure ? 'Retry' : 'Refresh'}</Button><Button variant="secondary" onPress={() => { setOpen(false); onReview(); }}>View complaints</Button></div>
      </Popover.Dialog>
    </Popover.Content>
  </Popover>;
}

export function SidebarAccount({ user, onSignOut, onSettings, settingsActive, Icon }) {
  const [open, setOpen] = useState(false);
  const name = user.name || 'Admin';
  const role = (user.role === 'collector' ? 'Driver' : user.role || 'Administrator').replace(/[_-]/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase());
  return <div className="sidebar-account-area"><Dropdown isOpen={open} onOpenChange={setOpen}>
    <Dropdown.Trigger className={`sidebar-account${open || settingsActive ? ' is-active' : ''}`} aria-label={`${name}, account options`} title={`${name} - ${role}`}>
      <SettingsAvatar user={user} /><span className="sidebar-account-copy sidebar-label"><strong>{name}</strong><small>{role}</small></span><span className="sidebar-account-chevron" aria-hidden="true"><SettingsIcon name="chevron" /></span>
    </Dropdown.Trigger>
    <Dropdown.Popover placement="top start" offset={12} className="account-menu"><Dropdown.Menu aria-label="Account options" onAction={key => { setOpen(false); if (key === 'settings') onSettings(); else if (key === 'signout') onSignOut(); }}>
      <Dropdown.Item id="settings" textValue="Settings"><SettingsIcon name="settings" />Settings</Dropdown.Item>
      <Dropdown.Item id="signout" textValue="Sign out" className="account-signout"><Icon name="logout" />Sign out</Dropdown.Item>
    </Dropdown.Menu></Dropdown.Popover>
  </Dropdown></div>;
}
