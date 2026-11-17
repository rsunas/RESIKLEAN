import { Button, Switch, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import AppSelect from '../components/AppSelect.jsx';
import { PasswordDialog, ProfileDialog, SettingsAvatar } from '../components/SettingsDialogs.jsx';
import { settingsRequest } from '../components/settingsApi.js';
import './SettingsPage.css';

// The current API has no super-admin permission. Never infer it from a display name.
// Operations remain hidden until a server-authorized capability is available.
const sections = [['account', 'Account'], ['appearance', 'Appearance and language'], ['notifications', 'Notifications'], ['preferences', 'Dashboard preferences'], ['security', 'Security']];
function ComingSoon() { return <span className="settings-soon">Coming soon</span>; }
function Section({ id, title, description, children }) {
  return <section className="settings-card" id={`settings-${id}`} aria-labelledby={`settings-${id}-title`}><h2 id={`settings-${id}-title`}>{title}</h2><p className="settings-description">{description}</p>{children}</section>;
}
function Row({ label, description, children, coming = false }) {
  return <div className="settings-row"><div className="settings-row-copy"><div className="settings-row-label">{label}{coming ? <ComingSoon /> : null}</div><p>{description}</p></div><div className="settings-control">{children}</div></div>;
}
function UnavailableOption({ children, reason }) {
  return <Tooltip delay={100}><Tooltip.Trigger className="settings-unavailable" tabIndex={0} aria-disabled="true" aria-label={`${children}. ${reason}`}><span>{children}</span></Tooltip.Trigger><Tooltip.Content>{reason}</Tooltip.Content></Tooltip>;
}
function Toggle({ label, selected = false, disabled = false, onChange }) {
  return <Switch aria-label={label} className="settings-switch" isSelected={selected} isDisabled={disabled} onChange={onChange}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>;
}
export default function SettingsPage({ user, token, onUserChange }) {
  const [profile, setProfile] = useState(user);
  const [settings, setSettings] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [retry, setRetry] = useState(0);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [active, setActive] = useState('account');
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoadError(''); setSettings(null);
    Promise.all([settingsRequest('settings', token, { signal: controller.signal }), settingsRequest('me', token, { signal: controller.signal })])
      .then(([data, me]) => { if (!controller.signal.aborted) { setSettings(data.settings); setProfile({ ...me, authProvider: data.authProvider, isPasswordSet: data.isPasswordSet }); onUserChange(me); } })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [token, retry, onUserChange]);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), toast.error ? 8000 : 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const nodes = sections.map(([id]) => document.getElementById(`settings-${id}`)).filter(Boolean);
        const atEnd = window.scrollY > 0 && window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        const current = atEnd ? nodes.at(-1) : nodes.filter(node => node.getBoundingClientRect().top <= 140).at(-1) || nodes[0];
        if (current) setActive(current.id.replace('settings-', ''));
      });
    };
    window.addEventListener('scroll', update, { passive: true }); window.addEventListener('resize', update); update();
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', update); window.removeEventListener('resize', update); };
  }, []);
  const savePreference = useCallback(async patch => {
    if (!settings || saving) return;
    const previous = settings;
    setSettings(current => ({ ...current, ...patch, notifications: { ...current.notifications, ...patch.notifications } })); setSaving(true);
    try {
      const data = await settingsRequest('settings', token, { method: 'PATCH', body: patch });
      if (mounted.current) { setSettings(data.settings); setToast({ text: 'Saved' }); }
    } catch (error) {
      if (mounted.current) { setSettings(previous); setToast({ text: error.message, error: true }); }
    } finally { if (mounted.current) setSaving(false); }
  }, [saving, settings, token]);
  return <div className="admin-settings"><header className="settings-heading"><h1>Settings</h1><p>Manage your account and dashboard preferences.</p></header>
    <div className="settings-layout"><nav className="settings-section-nav" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} href={`#settings-${id}`} aria-current={active === id ? 'location' : undefined} onClick={event => {
      event.preventDefault(); const node = document.getElementById(`settings-${id}`); node?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); setActive(id);
    }}>{label}</a>)}</nav>
    <div className="settings-sections">
      {loadError ? <div className="settings-load-error" role="alert">{loadError}<Button variant="secondary" onPress={() => setRetry(value => value + 1)}>Retry</Button></div> : !settings ? <p role="status" className="settings-muted">Loading account preferences...</p> : null}
      <Section id="account" title="Account" description="Your profile on the dashboard."><div className="settings-account"><SettingsAvatar user={profile} /><div className="settings-account-copy"><h3>{profile.name || 'Admin'}</h3><p>{profile.email}</p><span className="settings-admin-tag">Admin</span></div><Button variant="secondary" className="settings-outline" isDisabled={!settings} onPress={() => setDialog('profile')}>Edit profile</Button></div></Section>
      <Section id="appearance" title="Appearance and language" description="Personalize how the dashboard looks.">
        <Row label="Theme" description="The dashboard currently uses the light theme." coming><div className="settings-segmented" role="group" aria-label="Theme"><Button variant="tertiary" aria-pressed className="selected" isDisabled={!settings || saving} onPress={() => savePreference({ theme: 'light' })}>Light</Button><UnavailableOption reason="Dark mode is not available on the dashboard yet.">Dark</UnavailableOption><UnavailableOption reason="System theme needs dashboard dark-mode support.">System</UnavailableOption></div></Row>
        <Row label="Language" description="Dashboard translations are not available yet." coming><div className="settings-segmented" role="group" aria-label="Language"><Button variant="tertiary" aria-pressed className="selected" isDisabled={!settings || saving} onPress={() => savePreference({ language: 'en' })}>English</Button><UnavailableOption reason="Filipino translations are not available on the dashboard yet.">Filipino</UnavailableOption></div></Row>
      </Section>
      <Section id="notifications" title="Notifications" description="Choose what you want to be told about.">
        <Row label="Push notifications" description="Allow push notifications on devices registered to your account."><Toggle label="Push notifications" selected={!!settings?.notifications?.pushEnabled} disabled={!settings || saving} onChange={value => savePreference({ notifications: { pushEnabled: value } })} /></Row>
        <Row label="New complaints" description="When a resident submits a complaint." coming><Toggle label="New complaints" disabled /></Row>
        <Row label="Truckload submissions" description="When staff submit a new truckload." coming><Toggle label="Truckload submissions" disabled /></Row>
        <Row label="Account activity" description="New accounts and role changes." coming><Toggle label="Account activity" disabled /></Row>
      </Section>
      <Section id="preferences" title="Dashboard preferences" description="Defaults for charts and tables.">
        <Row label="Default date range" description="Saved defaults for the Overview charts are coming soon." coming><AppSelect aria-label="Default date range" disabled value="7" options={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: 'month', label: 'This month' }]} /></Row>
        <Row label="Rows per page" description="For now, choose the row count at the bottom of each table." coming><AppSelect aria-label="Default rows per page" disabled placeholder="Not set" value="" options={[10, 25, 50].map(value => ({ value: String(value), label: String(value) }))} /></Row>
      </Section>
      <Section id="security" title="Security" description="Keep your account safe."><Row label="Password" description="Change the password you use to sign in."><Button variant="secondary" className="settings-outline" isDisabled={!settings} onPress={() => setDialog('password')}>Change password</Button></Row></Section>
    </div></div>
    <div className="settings-toast-region" role="status" aria-live="polite" aria-atomic="true">{toast ? <div className={`settings-toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}</div>
    {dialog === 'password' ? <PasswordDialog user={profile} token={token} onClose={() => setDialog(null)} onSaved={() => { setProfile(current => ({ ...current, isPasswordSet: true })); setToast({ text: 'Password changed' }); }} /> : null}
    {dialog === 'profile' ? <ProfileDialog user={profile} token={token} onClose={() => setDialog(null)} onSaved={me => { setProfile(me); onUserChange(me); setToast({ text: 'Profile saved' }); }} /> : null}
  </div>;
}
