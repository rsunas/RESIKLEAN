import { useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { Button, Modal } from '@heroui/react';
import AnnouncementCombobox from '../components/announcements/AnnouncementCombobox.jsx';
import TablePagination from '../components/TablePagination.jsx';
import { AnnouncementCanvas, AnnouncementPreview } from '../components/announcements/AnnouncementCanvas.jsx';
import { exportAnnouncement, downloadAnnouncement } from '../components/announcements/exportImage.js';
import { types, reasons, impacts, presets, nextHour, manilaParts, formatDay, formatTime, generateMessage, scheduledDate } from '../../../backend/src/shared/announcements.mjs';
import './AnnouncementsPage.css';

const API = import.meta.env.VITE_API_URL;
const initial = () => ({ ...nextHour(), type: 'Service delay', reason: 'Flat tire', impact: 'Delays may occur', areaId: 'all', areaLabel: 'All areas', affectedTruckId: '', newDate: '' });
const itemFields = item => ({ type: item.type, reason: item.reason, impact: item.impact, areaId: item.areaId?._id || item.areaId || 'all', areaLabel: item.areaId?.name || item.areaLabel, affectedTruckId: item.affectedTruckId?._id || item.affectedTruckId || '', ...manilaParts(item.scheduledFor), newDate: item.newDate || '' });
const choices = values => values.map(value => ({ value, label: value }));

export default function AnnouncementsPage({ token }) {
  const [fields, setFields] = useState(initial);
  const [manualMessage, setManualMessage] = useState(null);
  const [editing, setEditing] = useState(null);
  const [options, setOptions] = useState({ areas: [], trucks: [] });
  const [optionsState, setOptionsState] = useState('loading');
  const [retryOptions, setRetryOptions] = useState(0);
  const [list, setList] = useState({ items: [], total: 0 });
  const [listState, setListState] = useState('loading');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const [notice, setNotice] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [captureFields, setCaptureFields] = useState(null);
  const canvas = useRef(null);
  const composer = useRef(null);
  const requestKey = useRef(crypto.randomUUID());
  const message = manualMessage ?? generateMessage(fields);

  const request = useCallback(async (path = '', init = {}) => {
    const response = await fetch(`${API}/admin/announcements${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...init.headers } });
    let result;
    try { result = await response.json(); } catch { throw new Error('The announcement service is unavailable. Please retry.'); }
    if (!response.ok || !result.success) throw new Error(result.error || 'Could not complete this request.');
    return result;
  }, [token]);

  useEffect(() => {
    const controller = new AbortController();
    setOptionsState('loading');
    request('/options', { signal: controller.signal }).then(result => { setOptions(result.data); setOptionsState('ready'); }).catch(error => { if (error.name !== 'AbortError') setOptionsState('error'); });
    return () => controller.abort();
  }, [request, retryOptions]);
  useEffect(() => {
    const controller = new AbortController();
    setListState('loading');
    request(`?page=${page}&limit=${pageSize}`, { signal: controller.signal }).then(result => {
      const lastPage = Math.max(1, Math.ceil(result.data.total / pageSize));
      if (page > lastPage) setPage(lastPage);
      setList(result.data); setListState('ready');
    }).catch(error => { if (error.name !== 'AbortError') setListState('error'); });
    return () => controller.abort();
  }, [request, page, pageSize, revision]);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);

  const update = (key, value) => setFields(current => ({ ...current, [key]: value, ...(key === 'areaId' ? { areaLabel: options.areas.find(area => area._id === value)?.name || 'All areas' } : {}), ...(key === 'impact' && value !== 'Rescheduled' ? { newDate: '' } : {}) }));
  const edit = item => {
    setEditing(item); setFields(itemFields(item)); setManualMessage(item.message); setNotice(null); setDialog(null);
    composer.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const reset = () => { setEditing(null); setFields(initial()); setManualMessage(null); requestKey.current = crypto.randomUUID(); };
  function validate(value, text, published = false) {
    scheduledDate(value.date, value.time);
    if (!value.areaId) throw new Error('Choose an area.');
    for (const key of ['type', 'reason', 'impact']) {
      if (!value[key]?.trim() || value[key].length > 80) throw new Error(`Enter a ${key} within 80 characters.`);
    }
    if (value.impact === 'Rescheduled') scheduledDate(value.newDate, '00:00');
    if (text.length > 500) throw new Error('Keep the message within 500 characters.');
    if (published && !text.trim()) throw new Error('Add a message before publishing.');
  }
  async function makeImage(value) {
    flushSync(() => setCaptureFields(value));
    return exportAnnouncement(canvas.current);
  }
  async function save(status, row = null) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(status); setNotice(null);
    const target = row || editing;
    const value = row ? itemFields(row) : fields;
    const text = row ? row.message : message;
    try {
      validate(value, text, status === 'published');
      const form = new FormData();
      for (const key of ['type', 'reason', 'impact', 'areaId', 'affectedTruckId', 'date', 'time', 'newDate']) form.set(key, value[key]);
      form.set('message', text); form.set('status', status);
      if (target) form.set('version', String(target.__v)); else form.set('requestKey', requestKey.current);
      if (status === 'published') form.set('image', await makeImage(value), 'announcement.jpg');
      const result = await request(target ? `/${target._id}` : '', { method: target ? 'PATCH' : 'POST', body: form });
      if (!row || editing?._id === row._id) { setEditing(result.data); setFields(itemFields(result.data)); setManualMessage(result.data.message); }
      setNotice({ text: result.warning || (status === 'published' ? 'Announcement published.' : 'Draft saved.'), error: Boolean(result.warning) });
      setPage(1); setRevision(current => current + 1);
    } catch (error) { setNotice({ text: error.message, error: true }); }
    finally { busyRef.current = false; setBusy(''); setCaptureFields(null); }
  }
  async function download() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy('download'); setNotice(null);
    try { validate(fields, message); downloadAnnouncement(await makeImage(fields), fields); setNotice({ text: 'Image downloaded.' }); }
    catch (error) { setNotice({ text: error.message, error: true }); }
    finally { busyRef.current = false; setBusy(''); setCaptureFields(null); }
  }
  async function confirmAction() {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(dialog.action); setNotice(null);
    try {
      const item = dialog.item;
      if (dialog.action === 'delete') await request(`/${item._id}`, { method: 'DELETE' });
      else {
        const form = new FormData(); form.set('status', 'draft'); form.set('version', String(item.__v));
        const result = await request(`/${item._id}`, { method: 'PATCH', body: form });
        if (editing?._id === item._id) setEditing(result.data);
      }
      if (dialog.action === 'delete' && editing?._id === item._id) reset();
      setNotice({ text: dialog.action === 'delete' ? 'Announcement deleted.' : 'Announcement moved to drafts.' });
      setDialog(null); setRevision(value => value + 1);
    } catch (error) { setNotice({ text: error.message, error: true }); }
    finally { busyRef.current = false; setBusy(''); }
  }
  const select = (key, label, items) => <AnnouncementCombobox label={label} value={fields[key] || (key === 'affectedTruckId' ? 'all-trucks' : '')} custom={['type', 'reason', 'impact'].includes(key)} disabled={Boolean(busy) || optionsState !== 'ready'} options={items} onChange={value => update(key, value === 'all-trucks' ? '' : value)} />;
  const dateInput = (key, label, type = 'date') => <div className="ann-field"><label htmlFor={`ann-${key}`}>{label}</label><input id={`ann-${key}`} type={type} required value={fields[key]} onChange={event => update(key, event.target.value)} /></div>;

  return <section className="announcements-page">
    {notice && <div className={`ann-toast${notice.error ? ' ann-error' : ''}`} role={notice.error ? 'alert' : 'status'}><span>{notice.text}</span><Button variant="ghost" isIconOnly aria-label="Dismiss message" onPress={() => setNotice(null)}>×</Button></div>}
    <div className="ann-top-grid">
      <section className="ann-card ann-composer" ref={composer} aria-labelledby="ann-compose-title">
        <header className="ann-card-heading"><div><h2 id="ann-compose-title">{editing ? 'Edit announcement' : 'New announcement'}</h2><p>Pick a preset, then adjust the details.</p></div>{editing && <Button variant="ghost" isDisabled={Boolean(busy)} onPress={() => setDialog({ action: 'reset' })}>New</Button>}</header>
        {optionsState === 'error' && <p className="ann-error" role="alert">Areas and trucks could not load. <Button variant="ghost" onPress={() => setRetryOptions(value => value + 1)}>Retry</Button></p>}
        <form onSubmit={event => { event.preventDefault(); void save('published'); }}>
          <fieldset disabled={Boolean(busy) || optionsState !== 'ready'}>
            <div className="ann-section-label">Quick presets</div>
            <div className="ann-presets">{Object.entries(presets).map(([reason, defaults]) => <Button key={reason} type="button" variant="secondary" aria-pressed={fields.reason === reason} onPress={() => setFields(current => ({ ...current, ...defaults, reason, newDate: defaults.impact === 'Rescheduled' ? current.newDate : '' }))}>{fields.reason === reason && <span aria-hidden="true">✓</span>}{reason}</Button>)}</div>
            <div className="ann-section-label">Details</div>
            <div className="ann-fields">
              {select('type', 'Type', choices(types))}{select('reason', 'Reason', choices(reasons))}
              {select('areaId', 'Area', [{ value: 'all', label: 'All areas' }, ...options.areas.map(area => ({ value: area._id, label: area.name }))])}
              {select('affectedTruckId', 'Affected truck (internal only)', [{ value: 'all-trucks', label: 'All trucks in area' }, ...options.trucks.map(truck => ({ value: truck._id, label: `Truck ${truck.truckNumber} · ${truck.plateNumber}` }))])}
              {dateInput('date', 'Date')}{dateInput('time', 'Time', 'time')}
              <div className="ann-wide">{select('impact', 'Impact', choices(impacts))}</div>
              {fields.impact === 'Rescheduled' && dateInput('newDate', 'New date')}
            </div>
            <div className="ann-section-label">Message</div>
            <div className="ann-message-heading"><label htmlFor="ann-message">Generated text (editable) {manualMessage !== null && <small>Edited</small>}</label><Button type="button" variant="ghost" onPress={() => setManualMessage(null)}>↻ Regenerate</Button></div>
            <textarea id="ann-message" rows={4} maxLength={500} value={message} onChange={event => setManualMessage(event.target.value)} aria-describedby="ann-message-count" />
            <p id="ann-message-count" className={message.length > 500 ? 'ann-count ann-error' : 'ann-count'}>{message.length} / 500</p>
            <div className="ann-form-actions">
              {editing?.status !== 'published' && <Button type="button" variant="secondary" onPress={() => save('draft')}>{busy === 'draft' ? <><span className="ann-spinner" /> Saving…</> : 'Save draft'}</Button>}
              <Button type="submit" className="ann-primary">{busy === 'published' ? <><span className="ann-spinner" /> Publishing…</> : editing?.status === 'published' ? 'Update announcement' : 'Publish announcement'}</Button>
            </div>
          </fieldset>
        </form>
        {optionsState === 'loading' && <p role="status" className="ann-loading">Loading areas and trucks…</p>}
      </section>
      <section className="ann-card ann-preview-card" aria-labelledby="ann-preview-title">
        <header className="ann-card-heading"><h2 id="ann-preview-title">Preview</h2><p>Announcement image</p></header>
        <AnnouncementPreview fields={fields} />
        <div className="ann-preview-bottom"><p>Ready to share with residents.</p><Button type="button" variant="secondary" isDisabled={Boolean(busy)} onPress={download}>{busy === 'download' ? 'Preparing…' : '↓ Download image'}</Button></div>
      </section>
    </div>
    <section className="ann-card ann-recent" aria-labelledby="ann-recent-title">
      <header className="ann-card-heading"><div><h2 id="ann-recent-title">Recent announcements</h2><p>Drafts and published updates, newest first.</p></div><Button variant="ghost" isDisabled={Boolean(busy) || listState === 'loading'} onPress={() => setRevision(value => value + 1)}>Refresh</Button></header>
      <div className="ann-table-scroll" aria-busy={listState === 'loading'}><table><thead><tr>{['Truck #', 'Date', 'Time', 'Area', 'Reason', 'Status', 'Actions'].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {listState === 'loading' ? Array.from({ length: 5 }, (_, index) => <tr key={index}><td colSpan={7}><div className="ann-skeleton" aria-label="Loading announcements" /></td></tr>) : listState === 'error' ? <tr><td colSpan={7}><div role="alert" className="ann-empty">Could not load announcements. <Button variant="secondary" onPress={() => setRevision(value => value + 1)}>Retry</Button></div></td></tr> : !list.items.length ? <tr><td colSpan={7} className="ann-empty">No announcements yet</td></tr> : list.items.map(item => {
          const parts = manilaParts(item.scheduledFor);
          return <tr key={item._id}><td><strong>{item.affectedTruckId ? `Truck ${item.affectedTruckId.truckNumber}` : 'All trucks'}</strong></td><td>{new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', dateStyle: 'medium' }).format(new Date(item.scheduledFor))}</td><td>{formatTime(parts.time)}</td><td>{item.areaLabel}</td><td>{item.reason}</td><td><span className={`ann-status ann-${item.status}`}>{item.status === 'published' ? 'Published' : 'Draft'}</span></td><td><div className="ann-row-actions"><Button variant="ghost" isDisabled={Boolean(busy)} onPress={() => setDialog({ action: 'view', item })}>View</Button><Button variant="ghost" isDisabled={Boolean(busy)} onPress={() => { if (editing || manualMessage !== null) setDialog({ action: 'edit', item }); else edit(item); }}>Edit</Button>{item.status === 'draft' ? <Button variant="ghost" isDisabled={Boolean(busy)} onPress={() => save('published', item)}>Publish</Button> : <Button variant="ghost" isDisabled={Boolean(busy)} onPress={() => setDialog({ action: 'unpublish', item })}>Unpublish</Button>}<Button variant="ghost" className="ann-delete" isDisabled={Boolean(busy)} onPress={() => setDialog({ action: 'delete', item })}>Delete</Button></div></td></tr>;
        })}
      </tbody></table></div>
      <TablePagination page={page} pageSize={pageSize} total={list.total} onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} label="Announcements" disabled={Boolean(busy) || listState !== 'ready'} />
    </section>
    <div className="ann-offscreen" aria-hidden="true"><AnnouncementCanvas canvasRef={canvas} fields={captureFields || fields} /></div>
    <Modal.Backdrop isOpen={Boolean(dialog)} isDismissable={!busy} onOpenChange={open => { if (!open && !busy) setDialog(null); }}>
      <Modal.Container placement="center"><Modal.Dialog className="ann-dialog" aria-labelledby="ann-dialog-title">
        <Modal.Heading id="ann-dialog-title">{dialog?.action === 'view' ? 'Announcement' : dialog?.action === 'delete' ? 'Delete announcement?' : dialog?.action === 'unpublish' ? 'Unpublish announcement?' : 'Replace the current form?'}</Modal.Heading>
        {dialog?.action === 'view' ? <>{dialog.item.imageUrl ? <img className="ann-view-image" src={dialog.item.imageUrl} alt={`${dialog.item.areaLabel}: ${dialog.item.reason}`} /> : <AnnouncementPreview fields={itemFields(dialog.item)} />}<p className="ann-view-message">{dialog.item.message || 'No message yet.'}</p><p>{dialog.item.areaLabel} · {formatDay(manilaParts(dialog.item.scheduledFor).date, true)}</p></> : <p>{dialog?.action === 'delete' ? 'This removes the announcement and its image.' : dialog?.action === 'unpublish' ? 'This will move the announcement back to drafts.' : 'Unsaved changes in the form will be replaced.'}</p>}
        <div className="ann-dialog-actions"><Button variant="secondary" isDisabled={Boolean(busy)} onPress={() => setDialog(null)}>{dialog?.action === 'view' ? 'Close' : 'Cancel'}</Button>{dialog?.action !== 'view' && <Button className="ann-primary" isDisabled={Boolean(busy)} onPress={() => { if (dialog.action === 'reset') { reset(); setDialog(null); } else if (dialog.action === 'edit') edit(dialog.item); else void confirmAction(); }}>{busy ? 'Working…' : 'Confirm'}</Button>}</div>
      </Modal.Dialog></Modal.Container>
    </Modal.Backdrop>
  </section>;
}
