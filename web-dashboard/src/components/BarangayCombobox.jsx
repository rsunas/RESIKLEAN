import { Button } from '@heroui/react';
import { useEffect, useId, useRef, useState } from 'react';
import './BarangayCombobox.css';

const searchable = (text) => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

export default function BarangayCombobox({ apiBase, value, onChange }) {
  const id = useId();
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [locations, setLocations] = useState([]);
  const [status, setStatus] = useState('loading');
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [browse, setBrowse] = useState(false);
  const [popupMounted, setPopupMounted] = useState(false);

  // Keep the panel mounted long enough to play the Select exit animation.
  useEffect(() => {
    if (open) {
      setPopupMounted(true);
      return;
    }
    const timeout = setTimeout(() => setPopupMounted(false), 100);
    return () => clearTimeout(timeout);
  }, [open]);
  const [caret, setCaret] = useState(value.length);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        if (!apiBase) throw new Error('Missing API URL');
        const response = await fetch(`${apiBase}/collection-locations?type=barangay`, { signal: controller.signal });
        const result = await response.json();
        if (!response.ok || !result.success || !Array.isArray(result.data)) throw new Error('Locations unavailable');
        const names = result.data.filter((location) => location.type === 'barangay' && typeof location.name === 'string').map((location) => location.name.trim()).filter(Boolean);
        const unique = [...new Map(names.map((name) => [searchable(name), name])).values()].sort((a, b) => a.localeCompare(b));
        if (!controller.signal.aborted) { setLocations(unique); setStatus('ready'); }
      } catch {
        if (!controller.signal.aborted) setStatus('error');
      }
    }
    void load();
    return () => controller.abort();
  }, [apiBase, attempt]);

  // Complete the comma-separated entry at the cursor, including edits to an
  // earlier entry. The route form still owns the same plain-text value.
  const cursor = Math.min(caret, value.length);
  const start = cursor === 0 ? 0 : value.lastIndexOf(',', cursor - 1) + 1;
  const nextComma = value.indexOf(',', cursor);
  const end = nextComma === -1 ? value.length : nextComma;
  const query = searchable(value.slice(start, end));
  const otherEntries = `${value.slice(0, start)}${value.slice(end)}`.split(',').map(searchable).filter(Boolean);
  const options = locations.filter((name) => !otherEntries.includes(searchable(name)) && (browse || searchable(name).includes(query)))
    .sort((a, b) => Number(!browse && searchable(b).startsWith(query)) - Number(!browse && searchable(a).startsWith(query)) || a.localeCompare(b));
  const activeIndex = active >= 0 && active < options.length ? active : -1;

  useEffect(() => {
    const list = listRef.current;
    const option = list?.children[activeIndex];
    if (!option) return;
    if (option.offsetTop < list.scrollTop) list.scrollTop = option.offsetTop;
    else if (option.offsetTop + option.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = option.offsetTop + option.offsetHeight - list.clientHeight;
  }, [activeIndex]);

  function choose(name) {
    const prefix = value.slice(0, start);
    const replacement = `${start ? ' ' : ''}${name}`;
    const suffix = nextComma === -1 ? ', ' : value.slice(end);
    const updated = `${prefix}${replacement}${suffix}`;
    const position = nextComma === -1 ? updated.length : prefix.length + replacement.length;
    onChange(updated);
    setCaret(position);
    setActive(-1);
    setBrowse(false);
    inputRef.current?.focus();
    setOpen(false);
    requestAnimationFrame(() => inputRef.current?.setSelectionRange(position, position));
  }

  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setOpen(true);
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(options.length ? (!open || activeIndex === -1 ? (step === 1 ? 0 : options.length - 1) : (activeIndex + step + options.length) % options.length) : -1);
    } else if (event.key === 'Enter' && open && activeIndex !== -1) {
      event.preventDefault();
      choose(options[activeIndex]);
    } else if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    } else if (event.key === 'Tab') setOpen(false);
  }

  return <div className="barangay-combobox" onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <label htmlFor={id}>Barangays</label>
    <div className="barangay-combobox-control">
      <svg className="barangay-field-icon" aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
      <input aria-activedescendant={open && activeIndex !== -1 ? `${id}-option-${activeIndex}` : undefined}
        aria-autocomplete="list" aria-controls={`${id}-list`} aria-describedby={`${id}-hint`} aria-expanded={open}
        autoComplete="off" id={id} role="combobox" ref={inputRef} required value={value}
        placeholder="e.g. Triangulo, Bagumbayan Norte"
        onChange={(event) => { onChange(event.target.value); setCaret(event.target.selectionStart ?? event.target.value.length); setBrowse(false); setActive(-1); setOpen(true); }}
        onSelect={(event) => {
          const position = event.currentTarget.selectionStart ?? value.length;
          if (position !== caret) { setCaret(position); setActive(-1); }
        }}
        onFocus={() => { setBrowse(false); setActive(-1); setOpen(true); }} onKeyDown={onKeyDown} />
      <Button variant="tertiary" aria-label={open && browse ? 'Hide barangay suggestions' : 'Browse barangays'} aria-controls={`${id}-list`} aria-expanded={open} aria-haspopup="listbox"
        className="barangay-combobox-toggle" type="button" onPress={() => {
          const next = !open || !browse;
          inputRef.current?.focus();
          setBrowse(true); setActive(-1); setOpen(next);
        }}>
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
      </Button>
    </div>
    <p id={`${id}-hint`}><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v2" /></svg>Separate multiple barangays with commas.</p>
    {open || popupMounted ? <div className="barangay-combobox-popup" data-state={open ? 'open' : 'closing'} aria-hidden={!open} inert={!open}>
      <ul aria-label="Barangay suggestions" id={`${id}-list`} role="listbox" ref={listRef}>
        {options.map((name, index) => <li aria-selected={index === activeIndex} id={`${id}-option-${index}`} key={name} role="option"
          onMouseDown={(event) => event.preventDefault()} onClick={() => choose(name)}>{name}</li>)}
      </ul>
      {status === 'loading' ? <p role="status">Loading barangays…</p> : status === 'error' ? <div className="barangay-combobox-feedback">
        <p role="status">Suggestions unavailable. You can still type barangays.</p>
        <Button variant="tertiary" type="button" onPress={() => { setStatus('loading'); setAttempt((current) => current + 1); }}>Retry</Button>
      </div> : !options.length ? <p role="status">{query && !browse ? 'No matching barangays. You can still type a name.' : 'No more barangays to suggest. You can still type a name.'}</p> : null}
    </div> : null}
  </div>;
}
