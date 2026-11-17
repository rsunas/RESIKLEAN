import { LoadingRegion, Skeleton, useLoadingPresentation } from './Skeleton.jsx';
import { Button, Modal } from '@heroui/react';
import { useEffect, useState } from 'react';
import './AccountModal.css';
import './AccountProfile.css';

function ProfileIcon({ name }) {
  const paths = {
    mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 6 9 7 9-7" /></>,
    phone: <path d="m7 3 3 5-3 3a16 16 0 0 0 6 6l3-3 5 3c0 3-2 4-4 4C9 20 4 15 3 7c0-2 1-4 4-4Z" />,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M7 3v4m10-4v4M3 11h18" /></>,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    route: <><circle cx="6" cy="18" r="3" /><circle cx="18" cy="6" r="3" /><path d="M6 15V9h12m0 0v6H9" /></>,
    truck: <><path d="M3 6h11v12H3Zm11 4h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
  };
  return <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}
function formatBirthday(value) {
  if (!value) return '';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(date);
}
function Detail({ label, value, icon, fallback = 'Not provided', loading = false }) {
  return <div className="account-profile-detail"><span className="account-profile-icon"><ProfileIcon name={icon} /></span><div><dt>{label}</dt><dd className={value ? '' : 'is-muted'}>{loading ? <Skeleton width={130} height={14}/> : value || fallback}</dd></div></div>;
}

export default function AccountIdentityButton({ account, token, apiUrl }) {
  const [open, setOpen] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ loading: true });
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoAttempt, setPhotoAttempt] = useState(0);
  const [photo, setPhoto] = useState({ loading: true });
  const [avatarFailed, setAvatarFailed] = useState(false);
  useEffect(() => { setAvatarFailed(false); }, [account.profilePhotoUrl]);
  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    setResult({ loading: true });
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/admin/users/${account.id}/identity`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.success) throw new Error(payload.error || 'Unable to load account details.');
        if (active) setResult({ loading: false, data: payload.data });
      } catch (error) {
        if (active) setResult({ loading: false, error: error.name === 'AbortError' ? 'Request timed out. Please retry.' : error.message });
      } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, attempt, account.id, token, apiUrl]);
  useEffect(() => {
    if (!open || !result.data?.hasIdPhoto) return undefined;
    setPhoto({ loading: true });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let active = true;
    (async () => {
      try {
        const response = await fetch(`${apiUrl.replace(/\/$/, '')}/admin/users/${account.id}/identity?reveal=true`, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
        const payload = await response.json();
        if (!response.ok || !payload.success || !payload.data?.idPhotoUrl) throw new Error(payload.error || 'No ID photo is available.');
        if (active) setPhoto({ loading: false, url: payload.data.idPhotoUrl });
      } catch (error) {
        if (active) setPhoto({ loading: false, error: error.name === 'AbortError' ? 'Request timed out. Please retry.' : error.message });
      } finally { clearTimeout(timeout); }
    })();
    return () => { active = false; clearTimeout(timeout); controller.abort(); };
  }, [open, result.data?.hasIdPhoto, photoAttempt, account.id, token, apiUrl]);
  const changeOpen = value => { setOpen(value); if (!value) { setPhotoOpen(false); setPhoto({ loading: true }); } };
  const detailsLoading = useLoadingPresentation({ loading: result.loading, hasData: Boolean(result.data), error: result.error, enabled: open });
  const truck = result.data?.assignedTruck;
  const truckLabel = truck ? [truck.truckNumber, truck.plateNumber].filter(Boolean).join(' / ') : '';
  const initials = (account.name || 'Account').split(' ').filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  return <><Button className="account-profile-trigger" size="sm" variant="secondary" isDisabled={!apiUrl || !/^[a-f0-9]{24}$/i.test(account.id)} onPress={() => { setResult({ loading: true }); changeOpen(true); }}>View details</Button>
    <Modal.Backdrop isOpen={open} onOpenChange={changeOpen} className="account-dialog-backdrop">
      <Modal.Container className="account-dialog-container" placement="center"><Modal.Dialog className="account-dialog account-profile-dialog" aria-label={`Account profile for ${account.name}`}>
        <div className="account-profile-scroll">
          <div className="account-profile-banner" aria-hidden="true" />
          <Button isIconOnly className="account-profile-close" aria-label="Close account profile" onPress={() => changeOpen(false)}><ProfileIcon name="close" /></Button>
          <div className="account-profile-identity">
            <div className="account-profile-avatar">{account.profilePhotoUrl && !avatarFailed ? <img src={account.profilePhotoUrl} alt={`${account.name}'s profile`} onError={() => setAvatarFailed(true)} /> : initials}</div>
            <div className="account-profile-heading"><p>ACCOUNT PROFILE</p><Modal.Heading>{account.name}</Modal.Heading></div>
            <span className={`account-profile-role role-${account.role}`}>{account.role === 'collector' ? 'Driver' : account.role ? account.role[0].toUpperCase() + account.role.slice(1) : 'Account'}</span>
          </div>
          <dl aria-busy={detailsLoading.busy} className={`account-profile-grid ${detailsLoading.initial && !detailsLoading.visible ? 'skeleton-waiting' : 'skeleton-ready'}`}>{detailsLoading.busy ? <dt className="skeleton-sr-only">Loading account details</dt> : null}
            <Detail label="Email" value={account.email} icon="mail" />
            <Detail label="Contact number" value={account.contact === '—' ? '' : account.contact} icon="phone" />
            <Detail loading={detailsLoading.initial} label="Birthday" value={formatBirthday(result.data?.birthday)} fallback={detailsLoading.failure ? 'Unavailable' : 'Not provided'} icon="calendar" />
            <Detail label="Assigned area" value={account.area === 'Not assigned' ? '' : account.area} fallback="Not assigned" icon="pin" />
            <Detail label="Shift" value={account.shift} fallback="Not assigned" icon="clock" />
            <Detail label="Assigned route" value={account.assignedRoute} fallback="Not assigned" icon="route" />
            <Detail loading={detailsLoading.initial} label="Assigned truck" value={truckLabel} fallback={detailsLoading.failure ? 'Unavailable' : 'Not assigned'} icon="truck" />
          </dl>
          {detailsLoading.failure ? <div className="account-profile-error"><p role="alert">{detailsLoading.failure}</p><Button variant="secondary" onPress={() => { detailsLoading.retry(); setAttempt(value => value + 1); }}>Retry</Button></div> : null}
          <div aria-busy={detailsLoading.busy} className={`account-profile-id ${detailsLoading.initial && !detailsLoading.visible ? 'skeleton-waiting' : ''}`}>
            <div className="account-profile-id-copy"><h3>ID photo</h3><p>{detailsLoading.initial ? <Skeleton width={200} height={13}/> : detailsLoading.failure ? 'Unable to load ID details.' : result.data?.hasIdPhoto ? 'Submitted identification document' : 'Not provided'}</p></div>
            {result.data?.hasIdPhoto ? <>
              <Button className="account-profile-view-id" isDisabled={!photo.url} onPress={() => setPhotoOpen(true)}><ProfileIcon name="eye" />Enlarge</Button>
              <LoadingRegion className="account-profile-id-preview" key={`${account.id}-${photoAttempt}`} loading={photo.loading} hasData={Boolean(photo.url)} error={photo.error} onRetry={() => { setPhoto({ loading: true }); setPhotoAttempt(value => value + 1); }} placeholder={<Skeleton height={290} radius={12}/>}>
                {photo.url ? <img src={photo.url} alt={`ID document for ${account.name}`} referrerPolicy="no-referrer" onError={() => setPhoto({ loading: false, error: 'The ID image could not load or its link expired. Please retry.' })} /> : null}
              </LoadingRegion>
            </> : null}
          </div>
        </div>
        <div className="account-dialog-footer"><Button className="account-cancel" onPress={() => changeOpen(false)}>Close</Button></div>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
    <Modal.Backdrop isOpen={open && photoOpen} onOpenChange={setPhotoOpen} isDismissable className="account-dialog-backdrop account-id-lightbox-backdrop">
      <Modal.Container placement="center" className="account-id-lightbox-container"><Modal.Dialog className="account-id-lightbox" aria-label={`ID photo for ${account.name}`}>
        <div className="account-id-lightbox-header"><Modal.Heading>ID photo</Modal.Heading><Button isIconOnly aria-label="Close ID photo" onPress={() => setPhotoOpen(false)}><ProfileIcon name="close" /></Button></div>
        <LoadingRegion key={`${account.id}-${photoAttempt}`} loading={photo.loading} hasData={Boolean(photo.url)} error={photo.error} onRetry={() => { setPhoto({ loading: true }); setPhotoAttempt(value => value + 1); }} placeholder={<Skeleton height={290} radius={18}/>}>
          {photo.url ? <img src={photo.url} alt={`ID document for ${account.name}`} referrerPolicy="no-referrer" onError={() => setPhoto({ loading: false, error: 'The ID image could not load or its link expired. Please retry.' })} /> : null}
        </LoadingRegion>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop></>;
}
