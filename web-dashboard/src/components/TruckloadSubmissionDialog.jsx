import { Button, Modal } from '@heroui/react';
import { useState } from 'react';
import './TruckloadSubmissionDialog.css';

function DetailIcon({ name, size = 20 }) {
  const paths = {
    image: <><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8" cy="8" r="1.5" /><path d="m3 17 5-5 4 4 4-5 5 6" /></>,
    expand: <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    pin: <><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>,
    truck: <><path d="M3 6h11v12H3Zm11 4h4l3 4v4h-7" /><circle cx="7" cy="18" r="2" /><circle cx="17" cy="18" r="2" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 6v6l4 2" /></>,
    plus: <path d="M5 12h14M12 5v14" />,
    minus: <path d="M5 12h14" />,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function number(value) {
  if (value == null || value === '') return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function measurement(value) {
  if (value === null) return '\u2014';
  return value.toLocaleString('en-US', { maximumSignificantDigits: 12 });
}
function submittedLabel(value) {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' }).format(date);
  const timeLabel = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }).format(date);
  return `${dateLabel} \u00b7 ${timeLabel}`;
}
function Photo({ src, label, onView }) {
  const [failed, setFailed] = useState(false);
  const available = src && !failed;
  return <figure className="tls-photo">
    {available ? <Button className="tls-photo-button" aria-label={`View ${label.toLowerCase()}`} onPress={() => onView({ src, label })}>
      <img src={src} alt={label} onError={() => setFailed(true)} />
      <span className="tls-photo-label">{label}</span><span className="tls-photo-expand"><DetailIcon name="expand" size={18} /></span>
    </Button> : <div className="tls-photo-placeholder" role="img" aria-label={`${label} unavailable`}><DetailIcon name="image" size={32} /><span>Photo unavailable</span><span className="tls-photo-label">{label}</span></div>}
  </figure>;
}
function PhotoViewer({ photo, onClose }) {
  const [zoom, setZoom] = useState(1);
  const [failed, setFailed] = useState(false);
  return <Modal.Backdrop isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }} className="tls-backdrop tls-viewer-backdrop">
    <Modal.Container placement="center" className="tls-container"><Modal.Dialog render={props => <section {...props} aria-modal="true" />} className="tls-dialog tls-viewer" aria-labelledby="tls-photo-title">
      <header className="tls-viewer-header"><Modal.Heading id="tls-photo-title">{photo.label}</Modal.Heading><div>
        <Button isIconOnly variant="secondary" aria-label="Zoom out" isDisabled={zoom <= 1 || failed} onPress={() => setZoom(value => value - 1)}><DetailIcon name="minus" /></Button>
        <span role="status">{zoom * 100}%</span>
        <Button isIconOnly variant="secondary" aria-label="Zoom in" isDisabled={zoom >= 3 || failed} onPress={() => setZoom(value => value + 1)}><DetailIcon name="plus" /></Button>
        <Button autoFocus isIconOnly variant="secondary" aria-label="Close photo" onPress={onClose}><DetailIcon name="close" /></Button>
      </div></header>
      <div className="tls-viewer-stage">{failed ? <p role="alert">This photo could not be loaded.</p> : <img src={photo.src} alt={photo.label} style={{ width: `${zoom * 100}%`, height: `${zoom * 100}%` }} onError={() => setFailed(true)} />}</div>
    </Modal.Dialog></Modal.Container>
  </Modal.Backdrop>;
}

export default function TruckloadSubmissionDialog({ activity, load, onClose }) {
  const [photo, setPhoto] = useState(null);
  // Use raw saved dimensions, not the table's rounded strings. As in the mobile calculator,
  // volume = L * W * H; the saved estimate already includes slope and the density factor.
  const dimensions = ['length', 'width', 'height'].map(key => number(load?.[key] ?? activity[key]));
  const rawVolume = dimensions.every(value => value !== null) ? dimensions.reduce((product, value) => product * value, 1) : null;
  const volume = Number.isFinite(rawVolume) ? rawVolume.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '\u2014';
  const slope = number(load?.slope) ?? number(Number.parseFloat(activity.slope));
  const slopeLabel = slope === null ? '\u2014' : `${slope >= 0 ? '+' : ''}${slope.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 6 })} m\u00b3`;
  const tonnage = String(activity.tonnage || '\u2014').replace(/\s*t$/, '');
  const frontPhoto = load?.sidePhotoUrl || activity.frontPhotoUrl || load?.photoUrl || (!activity.backPhotoUrl ? activity.photoUrl : '');
  const backPhoto = load?.backPhotoUrl || activity.backPhotoUrl;
  const initials = (activity.driver || 'Staff member').split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const details = [
    ['Area', activity.area, 'pin'], ['Staff', activity.driver, null], ['Truck number', activity.truckNumber || load?.truckNumber || '—', 'truck'],
    ['Submitted', submittedLabel(load?.arrivedAt || activity.submittedAt), 'clock'],
  ];
  return <>
    <Modal.Backdrop isOpen isDismissable onOpenChange={open => { if (!open) onClose(); }} className="tls-backdrop">
      <Modal.Container placement="center" className="tls-container"><Modal.Dialog render={props => <section {...props} aria-modal="true" />} className="tls-dialog" aria-labelledby="truckload-submission-title">
        <header className="tls-header"><div><p>LANDFILL OPERATIONS</p><Modal.Heading id="truckload-submission-title">Truckload submission</Modal.Heading></div><Button autoFocus isIconOnly variant="secondary" className="tls-close-icon" aria-label="Close truckload details" onPress={onClose}><DetailIcon name="close" /></Button></header>
        <div className="tls-body">
          <section className="tls-evidence" aria-label="Submission photos and notes"><div className="tls-photos"><Photo key={`front-${frontPhoto}`} src={frontPhoto} label="Front photo" onView={setPhoto} /><Photo key={`back-${backPhoto}`} src={backPhoto} label="Back photo" onView={setPhoto} /></div>
            {activity.notes?.trim() ? <div className="tls-notes"><h3>NOTES</h3><p>{activity.notes}</p></div> : null}
          </section>
          <section className="tls-summary" aria-label="Submission details">
            <div className="tls-tonnage"><h3>ESTIMATED TONNAGE</h3><div className={`tls-tonnage-value ${tonnage.length > 10 ? 'tls-tonnage-long' : ''}`}><strong>{tonnage}</strong><span>t</span></div>
              <dl className="tls-measurements">{['Length', 'Width', 'Height'].map((label, index) => <div key={label}><dt>{label}</dt><dd>{measurement(dimensions[index])} m</dd></div>)}
                <div className="tls-volume"><dt>Volume</dt><dd>{volume} m³</dd></div><div><dt>Slope</dt><dd>{slopeLabel}</dd></div>
              </dl>
            </div>
            <dl className="tls-details">{details.map(([label, value, icon]) => <div key={label}><span className="tls-detail-icon" aria-hidden="true">{icon ? <DetailIcon name={icon} /> : initials}</span><div><dt>{label}</dt><dd>{value || 'Not provided'}</dd></div></div>)}</dl>
          </section>
        </div>
        <footer className="tls-footer"><Button variant="secondary" className="tls-close" onPress={onClose}>Close</Button></footer>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
    {photo ? <PhotoViewer key={photo.src} photo={photo} onClose={() => setPhoto(null)} /> : null}
  </>;
}
