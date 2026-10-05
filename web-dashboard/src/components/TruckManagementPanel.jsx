import { Button, Card } from '@heroui/react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import AppSelect from './AppSelect.jsx';

const API_URL = import.meta.env.VITE_API_URL;
const EMPTY_TRUCK = { truckNumber: '', plateNumber: '', color: '', availability: 'available', length: '', width: '', height: '' };

function FleetIcon({ name, size = 18 }) {
  const paths = {
    archive: <><path d="M4 7h16v13H4z" /><path d="M3 4h18v3H3zM9 12h6" /></>,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    eye: <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.6" /></>,
    pencil: <><path d="m4 20 4.2-1 10.5-10.5a2.1 2.1 0 0 0-3-3L5.2 16 4 20Z" /><path d="m14.5 6.5 3 3" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    search: <><circle cx="10.8" cy="10.8" r="5.8" /><path d="m20 20-4.7-4.7" /></>,
    sort: <><path d="m8 9 4-4 4 4M16 15l-4 4-4-4" /></>,
    truck: <><path d="M3 7h11v10H3zM14 10h4l3 3v4h-7z" /><circle cx="7" cy="19" r="1.7" /><circle cx="18" cy="19" r="1.7" /></>,
  };

  return <svg aria-hidden="true" fill="none" height={size} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" viewBox="0 0 24 24" width={size}>{paths[name]}</svg>;
}

function getCapacity({ length, width, height }) {
  const values = [length, width, height].map(Number);
  if (values.some((value) => !Number.isFinite(value) || value <= 0)) return null;
  return values.reduce((total, value) => total * value, 1);
}

function normaliseServerTruck(truck, index) {
  return {
    ...truck,
    availability: truck.availability || 'available',
    color: truck.color || '',
    id: truck._id,
    // The finalized truck API stores dimensions in metres.
    length: Number(truck.length || 0),
    plateNumber: truck.plateNumber || '—',
    source: 'server',
    truckNumber: truck.truckNumber || `TR-${String(index + 1).padStart(3, '0')}`,
    width: Number(truck.width || 0),
    height: Number(truck.height || 0),
  };
}

function formatDimensions(truck) {
  return [truck.length, truck.width, truck.height].map((value) => Number(value).toFixed(2)).join(' × ');
}

function formatDimension(value) {
  return Number(value).toFixed(2);
}

function displayColor(value) {
  const legacyColors = { 'blue-green': 'Blue Green', 'orange-blue': 'Orange Blue' };
  return legacyColors[value] || value || 'Not set';
}

function getColorSwatch(value) {
  const color = displayColor(value).toLowerCase();
  if (color.includes('white')) return '#ffffff';
  if (color.includes('orange')) return '#f19046';
  if (color.includes('blue')) return '#3d8edb';
  if (color.includes('green')) return '#1d9c90';
  if (color.includes('red')) return '#de5b50';
  if (color.includes('yellow')) return '#f2c94c';
  if (color.includes('black')) return '#26302b';
  if (color.includes('gray') || color.includes('grey')) return '#94a09a';
  return '#dce4df';
}

export default function TruckManagementPanel({ token }) {
  const apiBase = API_URL?.replace(/\/$/, '');
  const [serverTrucks, setServerTrucks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState('');
  const [form, setForm] = useState(EMPTY_TRUCK);
  const [editingId, setEditingId] = useState(null);
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [selectedTruck, setSelectedTruck] = useState(null);
  const [archiveTarget, setArchiveTarget] = useState(null);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ field: 'truckNumber', direction: 'asc' });

  const loadTrucks = useCallback(async () => {
    if (!apiBase || !token) {
      setIsLoading(false);
      setListError(!apiBase ? 'VITE_API_URL is not configured.' : 'Sign in as an administrator to view trucks.');
      return;
    }

    setIsLoading(true);
    setListError('');
    try {
      const response = await fetch(`${apiBase}/trucks`, { headers: { Authorization: `Bearer ${token}` } });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to load trucks.');
      setServerTrucks((result.data?.trucks || []).map(normaliseServerTruck));
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to load trucks.');
    } finally {
      setIsLoading(false);
    }
  }, [apiBase, token]);

  useEffect(() => { void loadTrucks(); }, [loadTrucks]);

  const trucks = useMemo(() => serverTrucks, [serverTrucks]);

  const filteredTrucks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return trucks
      .filter((truck) => !normalizedQuery || truck.truckNumber.toLowerCase().includes(normalizedQuery) || truck.plateNumber.toLowerCase().includes(normalizedQuery))
      .sort((left, right) => {
        const result = left[sort.field].localeCompare(right[sort.field], undefined, { numeric: true, sensitivity: 'base' });
        return sort.direction === 'asc' ? result : -result;
      });
  }, [query, sort, trucks]);

  const liveCapacity = getCapacity(form);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));

  const closeEditor = () => {
    setEditingId(null);
    setForm(EMPTY_TRUCK);
    setIsEditorOpen(false);
  };

  const openCreateEditor = () => {
    setEditingId(null);
    setForm(EMPTY_TRUCK);
    setIsEditorOpen(true);
  };

  const openEditEditor = (truck) => {
    setEditingId(truck.id);
    setForm({
      color: truck.color,
      availability: truck.availability || 'available',
      height: String(truck.height),
      length: String(truck.length),
      plateNumber: truck.plateNumber,
      truckNumber: truck.truckNumber,
      width: String(truck.width),
    });
    setIsEditorOpen(true);
  };

  const saveTruck = async (event) => {
    event.preventDefault();
    const capacity = getCapacity(form);
    if (!capacity || !apiBase || !token) return;

    const payload = {
      availability: form.availability,
      color: form.color.trim(),
      height: Number(form.height),
      length: Number(form.length),
      plateNumber: form.plateNumber.trim().toUpperCase(),
      truckNumber: form.truckNumber.trim().toUpperCase(),
      width: Number(form.width),
    };

    setIsSaving(true);
    setListError('');
    try {
      const response = await fetch(`${apiBase}/admin/trucks${editingId ? `/${encodeURIComponent(editingId)}` : ''}`, {
        body: JSON.stringify(payload),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        method: editingId ? 'PATCH' : 'POST',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to save truck.');

      const savedTruck = normaliseServerTruck(result.data, serverTrucks.length);
      setServerTrucks((current) => editingId
        ? current.map((truck) => truck.id === editingId ? savedTruck : truck)
        : [...current, savedTruck]);
      closeEditor();
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to save truck.');
    } finally {
      setIsSaving(false);
    }
  };

  const confirmArchive = async () => {
    if (!archiveTarget || !apiBase || !token) return;

    setIsSaving(true);
    setListError('');
    try {
      const response = await fetch(`${apiBase}/admin/trucks/${encodeURIComponent(archiveTarget.id)}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: 'DELETE',
      });
      const result = await response.json();
      if (!response.ok || !result.success) throw new Error(result.error || 'Unable to archive truck.');

      setServerTrucks((current) => current.filter((truck) => truck.id !== archiveTarget.id));
      setArchiveTarget(null);
      if (selectedTruck?.id === archiveTarget.id) setSelectedTruck(null);
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Unable to archive truck.');
    } finally {
      setIsSaving(false);
    }
  };

  const toggleSort = (field) => {
    setSort((current) => current.field === field ? { field, direction: current.direction === 'asc' ? 'desc' : 'asc' } : { field, direction: 'asc' });
  };

  const renderSortHeader = (label, field) => <button className={`truck-sort-header ${sort.field === field ? 'is-sorted' : ''}`} onClick={() => toggleSort(field)} type="button">{label}<FleetIcon name="sort" size={13} /></button>;

  return <section className="truck-management-panel" aria-label="Truck management">
    <Card className="truck-directory-card">
      <div className="truck-filter-row">
        <label className="truck-search-control"><FleetIcon name="search" size={17} /><input aria-label="Search trucks" onChange={(event) => setQuery(event.target.value)} placeholder="Search truck no. or plate no." value={query} /></label>
        <Button className="primary-button truck-add-button" onPress={openCreateEditor} startContent={<FleetIcon name="plus" size={16} />}>Add truck</Button>
      </div>

      {listError ? <p className="feedback error-feedback" role="alert">{listError}</p> : null}
      <div className="truck-table-scroll">
        <table className="truck-table">
          <thead><tr><th>{renderSortHeader('Truck no.', 'truckNumber')}</th><th>{renderSortHeader('Plate no.', 'plateNumber')}</th><th>Color</th><th>Length (m)</th><th>Width (m)</th><th>Height (m)</th><th>Capacity (cu.m)</th><th>Availability</th><th className="truck-actions-heading">Actions</th></tr></thead>
          <tbody>
            {isLoading ? <tr><td className="truck-table-message" colSpan="9">Loading fleet…</td></tr> : null}
            {!isLoading && !listError && filteredTrucks.length === 0 ? <tr><td className="truck-table-message" colSpan="9">No trucks match the current filters.</td></tr> : null}
            {!isLoading && filteredTrucks.map((truck) => {
              const capacity = getCapacity(truck);
              return <tr key={truck.id}>
                <td><span className="truck-number"><span className="truck-number-icon"><FleetIcon name="truck" size={15} /></span><strong>{truck.truckNumber}</strong></span></td>
                <td className="truck-plate">{truck.plateNumber}</td>
                <td><span className="truck-color"><i className="truck-color-dot" style={{ backgroundColor: getColorSwatch(truck.color) }} />{displayColor(truck.color)}</span></td>
                <td className="truck-dimension">{formatDimension(truck.length)}</td>
                <td className="truck-dimension">{formatDimension(truck.width)}</td>
                <td className="truck-dimension">{formatDimension(truck.height)}</td>
                <td className="truck-capacity">{capacity ? capacity.toFixed(2) : '—'}</td>
                <td><span className={`truck-availability availability-${truck.availability}`}>{truck.availability === 'unavailable' ? 'Unavailable' : 'Available'}</span></td>
                <td><div className="truck-row-actions"><button aria-label={`View ${truck.truckNumber}`} className="truck-icon-button" onClick={() => setSelectedTruck(truck)} title="View details" type="button"><FleetIcon name="eye" size={17} /></button><button aria-label={`Edit ${truck.truckNumber}`} className="truck-icon-button" onClick={() => openEditEditor(truck)} title="Edit truck" type="button"><FleetIcon name="pencil" size={16} /></button><button aria-label={`Archive ${truck.truckNumber}`} className="truck-icon-button truck-archive-button" onClick={() => setArchiveTarget(truck)} title="Archive truck" type="button"><FleetIcon name="archive" size={16} /></button></div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="truck-table-count">{isLoading ? 'Loading trucks…' : `${filteredTrucks.length} of ${trucks.length} active truck${trucks.length === 1 ? '' : 's'}`}</p>
    </Card>

    {isEditorOpen ? <div className="modal-layer" onClick={closeEditor} role="presentation"><div aria-modal="true" className="truck-editor-modal" onClick={(event) => event.stopPropagation()} role="dialog"><form onSubmit={saveTruck}>
      <div className="modal-header"><div><p className="eyebrow">Fleet registry</p><h2>{editingId ? 'Edit truck' : 'Add truck'}</h2></div><button aria-label="Close truck form" onClick={closeEditor} type="button"><FleetIcon name="close" size={20} /></button></div>
      <div className="truck-editor-body">
        <div className="truck-editor-grid"><label>Truck no.<input autoCapitalize="characters" onChange={(event) => updateForm('truckNumber', event.target.value)} placeholder="TR-101" required value={form.truckNumber} /></label><label>Plate no.<input autoCapitalize="characters" onChange={(event) => updateForm('plateNumber', event.target.value)} placeholder="ABC-1234" required value={form.plateNumber} /></label></div>
        <div className="truck-editor-grid"><label>Color<input onChange={(event) => updateForm('color', event.target.value)} placeholder="e.g. Blue or White" required value={form.color} /></label><label>Availability<AppSelect aria-label="Truck availability" className="truck-availability-select" onChange={(availability) => updateForm('availability', availability)} options={[{ label: 'Available', value: 'available' }, { label: 'Unavailable', value: 'unavailable' }]} value={form.availability} /></label></div>
        <div className="truck-editor-grid truck-dimension-inputs"><label>Length (m)<input min="0" onChange={(event) => updateForm('length', event.target.value)} placeholder="3.80" required step="0.01" type="number" value={form.length} /></label><label>Width (m)<input min="0" onChange={(event) => updateForm('width', event.target.value)} placeholder="1.10" required step="0.01" type="number" value={form.width} /></label><label>Height (m)<input min="0" onChange={(event) => updateForm('height', event.target.value)} placeholder="2.40" required step="0.01" type="number" value={form.height} /></label></div>
        <div className="capacity-preview"><span>Capacity (cu.m)</span><strong>{liveCapacity ? liveCapacity.toFixed(2) : '0.00'}</strong><p>Calculated automatically from length × width × height. This value cannot be edited.</p></div>
      </div>
      <div className="modal-footer"><Button className="outline-button" isDisabled={isSaving} onPress={closeEditor} type="button" variant="secondary">Cancel</Button><Button className="primary-button" isDisabled={isSaving} type="submit">{isSaving ? 'Saving…' : editingId ? 'Save changes' : 'Add truck'}</Button></div>
    </form></div></div> : null}

    {selectedTruck ? <div className="modal-layer" onClick={() => setSelectedTruck(null)} role="presentation"><div aria-modal="true" className="truck-details-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Fleet vehicle</p><h2>{selectedTruck.truckNumber}</h2></div><button aria-label="Close truck details" onClick={() => setSelectedTruck(null)} type="button"><FleetIcon name="close" size={20} /></button></div><div className="truck-details-grid"><div><span>Plate no.</span><strong>{selectedTruck.plateNumber}</strong></div><div><span>Color</span><strong className="truck-color"><i className="truck-color-dot" style={{ backgroundColor: getColorSwatch(selectedTruck.color) }} />{displayColor(selectedTruck.color)}</strong></div><div><span>Dimensions</span><strong>{formatDimensions(selectedTruck)} m</strong></div><div><span>Capacity</span><strong>{getCapacity(selectedTruck)?.toFixed(2) || '—'} cu.m</strong></div><div><span>Availability</span><strong><span className={`truck-availability availability-${selectedTruck.availability}`}>{selectedTruck.availability === 'unavailable' ? 'Unavailable' : 'Available'}</span></strong></div></div><div className="modal-footer"><Button className="outline-button" onPress={() => setSelectedTruck(null)} variant="secondary">Close</Button><Button className="primary-button" onPress={() => { setSelectedTruck(null); openEditEditor(selectedTruck); }}>Edit truck</Button></div></div></div> : null}

    {archiveTarget ? <div className="modal-layer" onClick={() => !isSaving && setArchiveTarget(null)} role="presentation"><div aria-describedby="archive-truck-description" aria-modal="true" className="truck-archive-modal" onClick={(event) => event.stopPropagation()} role="dialog"><div className="modal-header"><div><p className="eyebrow">Archive truck</p><h2>Archive {archiveTarget.truckNumber}?</h2></div><button aria-label="Close archive confirmation" disabled={isSaving} onClick={() => setArchiveTarget(null)} type="button"><FleetIcon name="close" size={20} /></button></div><p id="archive-truck-description">This removes the truck from the active fleet list. It is an archive action, not a permanent deletion.</p><div className="modal-footer"><Button className="outline-button" isDisabled={isSaving} onPress={() => setArchiveTarget(null)} variant="secondary">Cancel</Button><Button className="truck-archive-confirm" isDisabled={isSaving} onPress={confirmArchive}>{isSaving ? 'Archiving…' : 'Archive truck'}</Button></div></div></div> : null}
  </section>;
}
