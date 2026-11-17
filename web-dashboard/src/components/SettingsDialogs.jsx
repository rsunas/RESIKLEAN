import { Button, Modal } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import { settingsRequest } from './settingsApi.js';

export function SettingsIcon({ name }) {
  const shapes = {
    settings: <><path d="m9 3-.5 2-2 .9-1.8-.6-2 3.4 1.5 1.4v2.8L2.7 14l2 3.4 1.8-.6 2 .9.5 2.3h4l.5-2.3 2-.9 1.8.6 2-3.4-1.5-1.1v-2.8l1.5-1.4-2-3.4-1.8.6-2-.9L13 3Z" /><circle cx="11" cy="11.5" r="3" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M9 5a11 11 0 0 1 3 0c6 0 10 7 10 7a19 19 0 0 1-4 5M6 6a22 22 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m6 14 6-6 6 6" />,
  };
  return <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{shapes[name]}</svg>;
}
export function SettingsAvatar({ user, className = '' }) {
  const [failed, setFailed] = useState('');
  const initials = (user.name || 'Admin').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <span className={`settings-avatar ${className}`} aria-hidden="true">{user.profilePhotoUrl && failed !== user.profilePhotoUrl ? <img alt="" src={user.profilePhotoUrl} onError={() => setFailed(user.profilePhotoUrl)} /> : initials}</span>;
}
function SettingsDialog({ title, children, onClose, onSubmit, saving, submitLabel, error, dirty = true }) {
  const closeButton = useRef(null);
  const [opener] = useState(() => document.activeElement);
  useEffect(() => {
    const frame = requestAnimationFrame(() => closeButton.current?.focus());
    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(() => { if (opener?.isConnected) opener.focus({ preventScroll: true }); });
    };
  }, [opener]);
  return <Modal.Backdrop isOpen isDismissable={!saving} isKeyboardDismissDisabled={saving} onOpenChange={open => { if (!open && !saving) onClose(); }} className="settings-backdrop">
    <Modal.Container placement="center"><Modal.Dialog render={props => <section {...props} aria-modal="true" />} className="settings-dialog" aria-labelledby="settings-dialog-title">
      <header><Modal.Heading id="settings-dialog-title">{title}</Modal.Heading><Button ref={closeButton} autoFocus isIconOnly variant="tertiary" aria-label={`Close ${title.toLowerCase()}`} isDisabled={saving} onPress={onClose}><SettingsIcon name="close" /></Button></header>
      <form onSubmit={onSubmit}><div className="settings-dialog-body">{children}{error ? <p className="settings-error" role="alert">{error}</p> : null}</div>
        <footer><Button variant="secondary" className="settings-outline" isDisabled={saving} onPress={onClose}>Cancel</Button><Button type="submit" className="settings-primary" isDisabled={saving || !dirty}>{saving ? 'Saving...' : submitLabel}</Button></footer>
      </form>
    </Modal.Dialog></Modal.Container>
  </Modal.Backdrop>;
}
export function PasswordDialog({ user, token, onClose, onSaved }) {
  const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [visible, setVisible] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const currentRequired = user.isPasswordSet !== false && user.authProvider !== 'google';
  const submit = async event => {
    event.preventDefault();
    if (saving) return;
    const next = values.newPassword.trim();
    if (currentRequired && !values.currentPassword) return setError('Current password is required.');
    if (next.length < 6) return setError('New password must be at least 6 characters.');
    if (values.newPassword !== values.confirmPassword) return setError('Passwords do not match.');
    if (values.currentPassword === next) return setError('New password cannot be the same as current password.');
    setError(''); setSaving(true);
    try {
      await settingsRequest('change-password', token, { method: 'PATCH', body: { currentPassword: values.currentPassword, newPassword: next } });
      onSaved(); onClose();
    } catch (failure) { setError(failure.message); } finally { setSaving(false); }
  };
  return <SettingsDialog title="Change password" onClose={onClose} onSubmit={submit} saving={saving} submitLabel="Save password" error={error}>
    <p className="settings-muted">Use at least 6 characters for your new password.</p>
    {Object.entries({ currentPassword: 'Current password', newPassword: 'New password', confirmPassword: 'Confirm new password' }).map(([key, label]) => <label className="settings-field" key={key} htmlFor={`settings-${key}`}><span>{label}{key === 'currentPassword' && !currentRequired ? ' (optional)' : ''}</span><span className="settings-password-input"><input id={`settings-${key}`} autoComplete={key === 'currentPassword' ? 'current-password' : 'new-password'} type={visible[key] ? 'text' : 'password'} value={values[key]} disabled={saving} onChange={event => setValues(current => ({ ...current, [key]: event.target.value }))} /><Button type="button" isIconOnly variant="tertiary" aria-label={`${visible[key] ? 'Hide' : 'Show'} ${label.toLowerCase()}`} aria-pressed={!!visible[key]} onPress={() => setVisible(current => ({ ...current, [key]: !current[key] }))}><SettingsIcon name={visible[key] ? 'hidden' : 'eye'} /></Button></span></label>)}
  </SettingsDialog>;
}
export function ProfileDialog({ user, token, onClose, onSaved }) {
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone || user.contact || '');
  const [photo, setPhoto] = useState(null);
  const [removed, setRemoved] = useState(false);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (!photo) { setPreview(''); return; }
    const url = URL.createObjectURL(photo); setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);
  const dirty = name.trim() !== user.name || phone.trim() !== (user.phone || user.contact || '') || !!photo || (removed && !!user.profilePhotoUrl);
  const submit = async event => {
    event.preventDefault(); if (saving || !dirty) return;
    if (!name.trim()) return setError('Full name is required.');
    setSaving(true); setError('');
    const body = new FormData(); body.append('name', name.trim()); body.append('phone', phone.trim());
    if (photo) body.append('avatar', photo);
    else if (removed) body.append('profilePhotoUrl', '');
    try {
      const data = await settingsRequest('me', token, { method: 'PATCH', body });
      onSaved(data.user || data); onClose();
    } catch (failure) { setError(failure.message); } finally { setSaving(false); }
  };
  return <SettingsDialog title="Edit profile" onClose={onClose} onSubmit={submit} saving={saving} submitLabel="Save changes" error={error} dirty={dirty}>
    <div className="settings-profile-photo"><SettingsAvatar user={{ name, profilePhotoUrl: preview || (!removed ? user.profilePhotoUrl : '') }} /><label className="settings-photo-picker">Profile photo<input aria-label="Profile photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={event => {
      const file = event.target.files?.[0]; if (!file) return;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) { setError('Choose a JPEG, PNG, or WebP image, 5 MB or smaller.'); event.target.value = ''; return; }
      setError(''); setPhoto(file); setRemoved(false);
    }} /><small>JPEG, PNG or WebP, up to 5 MB.</small></label></div>
    {(preview || (!removed && user.profilePhotoUrl)) ? <Button variant="tertiary" isDisabled={saving} onPress={() => { setPhoto(null); setRemoved(true); }}>Remove photo</Button> : null}
    <label className="settings-field" htmlFor="settings-profile-name">Full name<input id="settings-profile-name" autoComplete="name" value={name} disabled={saving} onChange={event => setName(event.target.value)} /></label>
    <label className="settings-field" htmlFor="settings-profile-phone">Contact number<input id="settings-profile-phone" type="tel" autoComplete="tel" value={phone} disabled={saving} onChange={event => setPhone(event.target.value)} /></label>
    <p className="settings-muted">Email and account role are managed by your administrator.</p>
  </SettingsDialog>;
}
