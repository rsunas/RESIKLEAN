import { Button, ListBox, Modal, Select } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import './AccountModal.css';
import AppDatePicker from './AppDatePicker.jsx';
import { today } from '@internationalized/date';

function FieldIcon({ name, size = 20 }) {
  const paths = {
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>,
    phone: <path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c0 3-2 4-4 4C9 20 4 15 3 7c0-2 1-4 4-4Z" />,
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V6a4 4 0 0 1 8 0v4" /></>,
    collector: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3" /><path d="M3 10h6m6 0h6m-9 5v6" /></>,
    staff: <><rect x="4" y="5" width="16" height="16" rx="2" /><path d="M9 5V3h6v2m-7 12h8" /><circle cx="12" cy="11" r="2" /></>,
    admin: <><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7l8-4Z" /><path d="m8 12 3 3 5-6" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v2" /></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    hidden: <><path d="m3 3 18 18M9 5a11 11 0 0 1 3 0c6 0 10 7 10 7a19 19 0 0 1-4 5M6 6a22 22 0 0 0-4 6s4 7 10 7a12 12 0 0 0 4-1" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    chevron: <path d="m6 9 6 6 6-6" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

export default function AccountModal({ isOpen, onClose, account, setAccount, submission, setSubmission, onSubmit }) {
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState(false);
  const fileInput = useRef(null);
  const idInput = useRef(null);
  useEffect(() => () => { if (account.avatarPreview) URL.revokeObjectURL(account.avatarPreview); }, [account.avatarPreview]);
  useEffect(() => () => { if (account.idPreview) URL.revokeObjectURL(account.idPreview); }, [account.idPreview]);
  useEffect(() => { if (!isOpen) { setTouched(false); setShowPassword(false); } }, [isOpen]);
  const dirty = touched || Boolean(account.name || account.contact || account.email || account.password || account.avatarFile || account.birthday || account.idFile || account.role !== 'collector');
  const update = (key, value) => { setTouched(true); setAccount(current => ({ ...current, [key]: value })); };
  function choosePhoto(event, identity = false) {
    setTouched(true);
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setSubmission({ loading: false, error: 'Choose a JPEG, PNG, or WebP image, 5 MB or smaller.', message: '' });
      event.target.value = '';
      return;
    }
    setSubmission(current => ({ ...current, error: '' }));
    setAccount(current => ({ ...current, [identity ? 'idFile' : 'avatarFile']: file, [identity ? 'idPreview' : 'avatarPreview']: URL.createObjectURL(file) }));
  }
  const close = () => { setShowPassword(false); setTouched(false); onClose(); };
  const input = (key, label, icon, placeholder, props = {}) => <div className={`account-field account-field-${key}`}>
    <label htmlFor={`account-${key}`}>{label}</label>
    <div className="account-input-wrap"><FieldIcon name={icon} /><input id={`account-${key}`} value={account[key]} onChange={event => update(key, event.target.value)} placeholder={placeholder} {...props} />
      {key === 'password' ? <Button variant="tertiary" type="button" className="account-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} aria-pressed={showPassword} onPress={() => setShowPassword(value => !value)}><FieldIcon name={showPassword ? 'hidden' : 'eye'} /></Button> : null}
    </div>
    {key === 'password' ? <p className="account-hint" id="account-password-hint">At least 6 characters</p> : null}
  </div>;
  return <Modal.Backdrop isOpen={isOpen} isDismissable={!dirty} onOpenChange={open => { if (!open) close(); }} className="account-dialog-backdrop">
    <Modal.Container className="account-dialog-container" placement="center">
      <Modal.Dialog className="account-dialog" aria-labelledby="account-dialog-title">
        <form onSubmit={onSubmit}>
          <div className="account-dialog-header"><div><p>ACCOUNT MANAGEMENT</p><Modal.Heading id="account-dialog-title">Add new account</Modal.Heading></div><Button variant="tertiary" className="account-dialog-close" aria-label="Close account form" type="button" onPress={close}><FieldIcon name="close" /></Button></div>
          <div className="account-dialog-body">
            {input('name', 'Full name', 'user', 'e.g. Juan dela Cruz', { required: true, autoFocus: true })}
            <div className="account-contact-role">
              {input('contact', 'Contact number', 'phone', '09XXXXXXXXX', { 'aria-describedby': 'account-contact-note' })}
              <div className="account-field"><label id="account-role-label" htmlFor="account-role">Role</label><Select aria-labelledby="account-role-label" className="account-role-select" selectedKey={account.role} onSelectionChange={key => { if (key) update('role', String(key)); }}>
                <Select.Trigger id="account-role"><FieldIcon name={account.role} /><Select.Value /><Select.Indicator /></Select.Trigger>
                <Select.Popover className="account-role-popover"><ListBox aria-label="Role">
                  <ListBox.Item id="collector" textValue="Driver"><FieldIcon name="collector" />Driver</ListBox.Item>
                  <ListBox.Item id="staff" textValue="Staff"><FieldIcon name="staff" />Staff</ListBox.Item>
                  <ListBox.Item id="admin" textValue="Admin"><FieldIcon name="admin" />Admin</ListBox.Item>
                </ListBox></Select.Popover>
              </Select></div>
              <p className="account-contact-note" id="account-contact-note"><FieldIcon name="info" size={14} /><span>Admin accounts can sign in to the dashboard and manage all pages.</span></p>
            </div>
            <div className="account-field account-field-birthday"><AppDatePicker id="account-birthday" label="Birthday (optional)" value={account.birthday} onChange={value => update('birthday', value)} min="1900-01-01" max={today('Asia/Manila').toString()} /></div>
            {input('email', 'Email address', 'mail', 'user@nagacity.gov.ph')}
            {input('password', 'Temporary password', 'lock', 'At least 6 characters', { required: true, minLength: 6, type: showPassword ? 'text' : 'password', 'aria-describedby': 'account-password-hint' })}
            <div className="account-field"><label htmlFor="account-photo">Profile picture</label><div className="account-upload">
              <span className="account-upload-avatar">{account.avatarPreview ? <img src={account.avatarPreview} alt="Selected profile preview" /> : <FieldIcon name="user" size={28} />}</span>
              <div className="account-upload-details"><Button variant="tertiary" type="button" onPress={() => fileInput.current?.click()}><FieldIcon name="upload" />Choose file</Button><span>{account.avatarFile?.name || 'No file chosen'}</span></div>
              <input ref={fileInput} id="account-photo" type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => choosePhoto(event)} />
            </div></div>
            <div className="account-field"><label htmlFor="account-id-photo">ID picture (optional)</label><div className="account-upload">
              <span className="account-upload-avatar account-id-preview">{account.idPreview ? <img src={account.idPreview} alt="Selected ID preview" /> : <FieldIcon name="staff" size={28} />}</span>
              <div className="account-upload-details"><Button variant="tertiary" type="button" onPress={() => idInput.current?.click()}><FieldIcon name="upload" />Choose ID image</Button><span>{account.idFile?.name || 'No file chosen'}</span>{account.idFile ? <Button variant="tertiary" type="button" onPress={() => { update('idFile', null); update('idPreview', ''); if (idInput.current) idInput.current.value = ''; }}>Remove ID image</Button> : null}</div>
              <input ref={idInput} id="account-id-photo" type="file" hidden accept="image/jpeg,image/png,image/webp" onChange={event => choosePhoto(event, true)} />
            </div><p className="account-hint">JPEG, PNG, or WebP, up to 5 MB. Birthday and ID image are only available to administrators in account details.</p></div>
            {submission.error ? <p className="account-form-error" role="alert">{submission.error}</p> : null}
          </div>
          <div className="account-dialog-footer"><Button className="account-cancel" variant="secondary" type="button" onPress={close}>Cancel</Button><Button className="account-create" isDisabled={submission.loading} type="submit">{submission.loading ? 'Creating…' : 'Create account'}</Button></div>
        </form>
      </Modal.Dialog>
    </Modal.Container>
  </Modal.Backdrop>;
}