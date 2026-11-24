import { Button, Switch } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PasswordDialog, ProfileDialog, SettingsAvatar } from '../components/SettingsDialogs.jsx';
import { settingsRequest } from '../components/settingsApi.js';
import { translate, usePreferences } from '../components/preferences.jsx';
import './SettingsPage.css';

// The current API has no super-admin permission. Never infer it from a display name.
// Operations remain hidden until a server-authorized capability is available.
const sections = [['account', 'Account'], ['appearance', 'Appearance and language'], ['notifications', 'Notifications'], ['security', 'Security']];
function ComingSoon() { return <span className="settings-soon">Coming soon</span>; }
function Section({ id, title, description, children }) {
  const { preferences } = usePreferences();
  return <section className="settings-card" id={`settings-${id}`} aria-labelledby={`settings-${id}-title`}><h2 id={`settings-${id}-title`}>{translate(title, preferences.language)}</h2><p className="settings-description">{translate(description, preferences.language)}</p>{children}</section>;
}
function Row({ label, description, children, coming = false }) {
  const { preferences } = usePreferences();
  return <div className="settings-row"><div className="settings-row-copy"><div className="settings-row-label">{translate(label, preferences.language)}{coming ? <ComingSoon /> : null}</div><p>{translate(description, preferences.language)}</p></div><div className="settings-control">{children}</div></div>;
}
function Toggle({ label, selected = false, disabled = false, onChange }) {
  return <Switch aria-label={label} className="settings-switch" isSelected={selected} isDisabled={disabled} onChange={onChange}><Switch.Content><Switch.Control><Switch.Thumb /></Switch.Control></Switch.Content></Switch>;
}
export default function SettingsPage({ user, token, onUserChange }) {
  const { preferences, setPreferences } = usePreferences();
  const tr = value => translate(value, preferences.language);
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
      .then(([data, me]) => { if (!controller.signal.aborted) { const loaded = { ...data.settings, theme: data.settings?.theme === 'dark' ? 'dark' : 'light' }; setSettings(loaded); setPreferences(current => ({ ...current, theme: loaded.theme, language: loaded.language === 'fil' ? 'fil' : 'en' })); setProfile({ ...me, authProvider: data.authProvider, isPasswordSet: data.isPasswordSet }); onUserChange(me); } })
      .catch(error => { if (!controller.signal.aborted) setLoadError(error.message); });
    return () => controller.abort();
  }, [token, retry, onUserChange, setPreferences]);
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
    setSettings(current => ({ ...current, ...patch, notifications: { ...current.notifications, ...patch.notifications } }));
    setPreferences(current => ({ ...current, ...(patch.theme ? { theme: patch.theme } : {}), ...(patch.language ? { language: patch.language } : {}) })); setSaving(true);
    try {
      const data = await settingsRequest('settings', token, { method: 'PATCH', body: patch });
      if (mounted.current) { setSettings(data.settings); setToast({ text: 'Saved' }); }
    } catch (error) {
      if (mounted.current) { setSettings(previous); setPreferences(current => ({ ...current, theme: previous.theme === 'dark' ? 'dark' : 'light', language: previous.language === 'fil' ? 'fil' : 'en' })); setToast({ text: error.message, error: true }); }
    } finally { if (mounted.current) setSaving(false); }
  }, [saving, settings, token, setPreferences]);
  return <div className="admin-settings"><header className="settings-heading"><h1>{tr('Settings')}</h1><p>{tr('Manage your account, appearance, notifications, and security.')}</p></header>
    <div className="settings-layout"><nav className="settings-section-nav" aria-label="Settings sections">{sections.map(([id, label]) => <a key={id} href={`#settings-${id}`} aria-current={active === id ? 'location' : undefined} onClick={event => {
      event.preventDefault(); const node = document.getElementById(`settings-${id}`); node?.scrollIntoView({ block: 'start', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' }); setActive(id);
    }}>{tr(label)}</a>)}</nav>
    <div className="settings-sections">
      {loadError ? <div className="settings-load-error" role="alert">{loadError}<Button variant="secondary" onPress={() => setRetry(value => value + 1)}>Retry</Button></div> : !settings ? <p role="status" className="settings-muted">Loading account preferences...</p> : null}
      <Section id="account" title={tr('Account')} description={tr('Your profile on the dashboard.')}><div className="settings-account"><SettingsAvatar user={profile} /><div className="settings-account-copy"><h3>{profile.name || 'Admin'}</h3><p>{profile.email}</p><span className="settings-admin-tag">Admin</span></div><Button variant="secondary" className="settings-outline" isDisabled={!settings} onPress={() => setDialog('profile')}>{tr('Edit profile')}</Button></div></Section>
      <Section id="appearance" title={tr('Appearance and language')} description={tr('Personalize how the dashboard looks.')}>
        <Row label={tr('Theme')} description={tr('The dashboard color scheme.')}><div className="settings-segmented" role="group" aria-label={tr('Theme')}>{['light', 'dark'].map(value => <Button key={value} variant="tertiary" aria-pressed={preferences.theme === value} className={preferences.theme === value ? 'selected' : ''} isDisabled={!settings || saving} onPress={() => savePreference({ theme: value })}>{tr(value === 'light' ? 'Light' : 'Dark')}</Button>)}</div></Row>
        <Row label={tr('Language')} description={tr('Language used across the dashboard.')}><div className="settings-segmented" role="group" aria-label={tr('Language')}>{[['en', 'English'], ['fil', 'Filipino']].map(([value, label]) => <Button key={value} variant="tertiary" aria-pressed={preferences.language === value} className={preferences.language === value ? 'selected' : ''} isDisabled={!settings || saving} onPress={() => savePreference({ language: value })}>{tr(label)}</Button>)}</div></Row>
      </Section>
      <Section id="notifications" title="Notifications" description="Choose what you want to be told about.">
        <Row label="Push notifications" description="Allow push notifications on devices registered to your account."><Toggle label="Push notifications" selected={!!settings?.notifications?.pushEnabled} disabled={!settings || saving} onChange={value => savePreference({ notifications: { pushEnabled: value } })} /></Row>
        <Row label="New complaints" description="New complaints appear in the Notifications feed."><span className="settings-available">{tr('In dashboard feed')}</span></Row>
        <Row label="Truckload submissions" description="Truckload submissions appear in the Notifications feed."><span className="settings-available">{tr('In dashboard feed')}</span></Row>
      </Section>
      <Section id="security" title="Security" description="Keep your account safe."><Row label="Password" description="Change the password you use to sign in."><Button variant="secondary" className="settings-outline" isDisabled={!settings} onPress={() => setDialog('password')}>Change password</Button></Row></Section>
    </div></div>
    <div className="settings-toast-region" role="status" aria-live="polite" aria-atomic="true">{toast ? <div className={`settings-toast${toast.error ? ' error' : ''}`}>{toast.text}</div> : null}</div>
    {dialog === 'password' ? <PasswordDialog user={profile} token={token} onClose={() => setDialog(null)} onSaved={() => { setProfile(current => ({ ...current, isPasswordSet: true })); setToast({ text: 'Password changed' }); }} /> : null}
    {dialog === 'profile' ? <ProfileDialog user={profile} token={token} onClose={() => setDialog(null)} onSaved={me => { setProfile(me); onUserChange(me); setToast({ text: 'Profile saved' }); }} /> : null}
  </div>;
}
