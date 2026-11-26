import { Button } from '@heroui/react';
import AppDatePicker from './AppDatePicker.jsx';
import './AdminListFilters.css';

export default function AdminListFilters({ label, placeholder, value, onChange, onClear, disabled, children }) {
  const invalid = Boolean(value.from && value.to && value.from > value.to);
  return <div className="admin-list-filters" role="search" aria-label={label}>
    <div className={children ? "admin-list-primary has-selects" : "admin-list-primary"}>
    <label className="admin-list-search">
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/></svg>
      <input type="search" aria-label={label} placeholder={placeholder} maxLength={200} value={value.q || ''} disabled={disabled} onChange={event => onChange({ q: event.target.value })}/>
    </label>
    {children}
    </div>
    <div className="admin-list-dates">
    <AppDatePicker isDisabled={disabled} label="From" ariaLabel={label + ' from date'} value={value.from || ''} max={value.to || undefined} onChange={from => onChange({ from })} isInvalid={invalid}/>
    <AppDatePicker isDisabled={disabled} label="To" ariaLabel={label + ' to date'} value={value.to || ''} min={value.from || undefined} onChange={to => onChange({ to })} isInvalid={invalid}/>
    <Button className="admin-list-clear" variant="secondary" isDisabled={disabled} onPress={onClear} aria-label={'Clear ' + label.toLowerCase() + ' filters'}><svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 10a9 9 0 1 1 2.6 8.4"/><path d="M3 4v6h6"/></svg>Clear filters</Button>
    </div>
    {invalid ? <p className="admin-list-filter-error" role="alert">From date must be before or equal to To date.</p> : null}
  </div>;
}
