import { Skeleton, useLoadingPresentation } from './Skeleton.jsx';
import { Button, Dropdown } from '@heroui/react';
import { useState } from 'react';
import { SettingsAvatar, SettingsIcon } from './SettingsDialogs.jsx';

export function NotificationNav({ count, loading, error, active, onOpen, Icon }) {
  const badge = useLoadingPresentation({ loading, hasData: count !== null, error });
  return <Button className={`nav-link sidebar-notifications${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={`Notifications${count !== null ? `, ${count} unread` : ''}`} title="Notifications" variant="ghost" onPress={onOpen}>
    <Icon name="bell"/><span className="sidebar-label">Notifications</span>
    <span aria-busy={badge.busy}>{badge.initial ? <><span className="skeleton-sr-only">Loading notifications</span><Skeleton variant="circle" width={24} height={24}/></> : <span className="notification-count" aria-hidden="true">{count === null ? '\u2014' : count > 99 ? '99+' : count}</span>}</span>
  </Button>;
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
