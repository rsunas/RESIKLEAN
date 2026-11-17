import { Button, Input } from '@heroui/react';
import { useState } from 'react';
import AppSelect from './AppSelect.jsx';
import './TablePagination.css';

function PageInput({ page, pages, disabled, onChange, label }) {
  const [draft, setDraft] = useState(String(page));
  const commit = () => {
    const next = Math.max(1, Math.min(pages, Math.trunc(Number(draft)) || 1));
    setDraft(String(next));
    onChange(next);
  };
  return <Input aria-label={`Go to ${label.toLowerCase()} page`} className="table-page-input" type="number" inputMode="numeric" min={1} max={pages} step={1} disabled={disabled} value={draft} onChange={event => setDraft(event.target.value)} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(); } }} />;
}

export default function TablePagination({ page, pageSize, total, onPageChange, onPageSizeChange, label = 'Staff activity', disabled = false }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = Math.max(1, Math.min(page - 2, pages - 4));
  const visible = Array.from({ length: Math.min(5, pages) }, (_, index) => first + index);
  return <div className="table-pagination">
    <div className="table-pagination-settings">
      <span className="table-page-jump">Page <PageInput key={`${page}-${pages}`} label={label} page={page} pages={pages} disabled={disabled || !total} onChange={onPageChange} /> of {pages}</span>
      <div className="table-page-size"><span>Rows per page</span><AppSelect aria-label={`${label} rows per page`} disabled={disabled} value={String(pageSize)} onChange={value => onPageSizeChange(Number(value))} options={[7, 10, 20, 50].map(value => ({ value: String(value), label: String(value) }))} /></div>
      <span className="table-page-count" role="status" aria-live="polite">{total ? `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total}` : '0 results'}</span>
    </div>
    <nav className="table-page-controls" aria-label={`${label} pages`}>
      <Button isIconOnly variant="secondary" aria-label="First page" isDisabled={disabled || page === 1 || !total} onPress={() => onPageChange(1)}>«</Button>
      <Button isIconOnly variant="secondary" aria-label="Previous page" isDisabled={disabled || page === 1 || !total} onPress={() => onPageChange(page - 1)}>‹</Button>
      {visible.map(value => <Button key={value} isIconOnly variant={value === page ? 'secondary' : 'ghost'} aria-label={`Page ${value}`} aria-current={value === page ? 'page' : undefined} isDisabled={disabled || !total} onPress={() => onPageChange(value)}>{value}</Button>)}
      <Button isIconOnly variant="secondary" aria-label="Next page" isDisabled={disabled || page === pages || !total} onPress={() => onPageChange(page + 1)}>›</Button>
      <Button isIconOnly variant="secondary" aria-label="Last page" isDisabled={disabled || page === pages || !total} onPress={() => onPageChange(pages)}>»</Button>
    </nav>
  </div>;
}
