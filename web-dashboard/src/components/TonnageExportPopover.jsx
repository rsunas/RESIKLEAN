import { Button, Popover } from '@heroui/react';
import { useState, useMemo } from 'react';
import AppDatePicker from './AppDatePicker.jsx';

// Helpers for Manila time
const getManilaDateStr = (date) => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(date);
};

const getManilaTodayStr = () => getManilaDateStr(new Date());

const addDays = (date, days) => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

const presets = [
  { label: 'Last 7 days', getRange: () => [getManilaDateStr(addDays(new Date(), -6)), getManilaTodayStr()] },
  { label: 'Last 30 days', getRange: () => [getManilaDateStr(addDays(new Date(), -29)), getManilaTodayStr()] },
  { label: 'This month', getRange: () => {
      const d = new Date();
      // To get first day of Manila month safely:
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(d);
      const y = parts.find(p => p.type === 'year').value;
      const m = parts.find(p => p.type === 'month').value;
      return [`${y}-${m}-01`, getManilaTodayStr()];
    }
  },
  { label: 'Last month', getRange: () => {
      const d = new Date();
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit' }).formatToParts(d);
      let y = parseInt(parts.find(p => p.type === 'year').value, 10);
      let m = parseInt(parts.find(p => p.type === 'month').value, 10);
      m -= 1;
      if (m === 0) { m = 12; y -= 1; }
      const mm = m.toString().padStart(2, '0');
      const start = `${y}-${mm}-01`;
      // last day of last month
      const lastDay = new Date(y, m, 0).getDate();
      const end = `${y}-${mm}-${lastDay}`;
      return [start, end];
    }
  }
];

export default function TonnageExportPopover({ onExport, range }) {
  const [isOpen, setIsOpen] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [mode, setMode] = useState('preset'); // 'preset' | 'custom'
  const [loading, setLoading] = useState(false);

  const todayStr = getManilaTodayStr();

  const handlePreset = (getRange) => {
    const [s, e] = getRange();
    setStart(s);
    setEnd(e);
    setMode('custom');
  };

  const daysDiff = useMemo(() => {
    if (!start || !end) return 0;
    const s = new Date(start);
    const e = new Date(end);
    return Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1;
  }, [start, end]);

  const isValid = start && end && start <= end && end <= todayStr && daysDiff <= 92;
  const isTooLong = daysDiff > 92;

  const handleExport = async () => {
    if (!isValid) return;
    setLoading(true);
    try {
      await onExport(start, end);
      setIsOpen(false);
    } catch {
      // The export callback reports the error; keep the selection available for retry.
    } finally {
      setLoading(false);
    }
  };

  return (
    <Popover isOpen={isOpen} onOpenChange={open => {
      if (open && range) { setStart(range.start.toString()); setEnd(range.end.toString()); setMode('custom'); }
      setIsOpen(open);
    }}>
        <Button className="outline-button chart-export-button" variant="secondary">Export</Button>
      <Popover.Content placement="bottom end" className="tonnage-export-content p-4 w-72">
        <Popover.Dialog aria-label="Export Tonnage Trend" className="flex flex-col gap-4">
          <h4 className="text-sm font-semibold text-gray-800">Export Tonnage Trend</h4>
          
          {mode === 'preset' ? (
            <div className="flex flex-col gap-2">
              {presets.map(p => (
                <Button key={p.label} size="sm" variant="secondary" onPress={() => handlePreset(p.getRange)} className="justify-start">
                  {p.label}
                </Button>
              ))}
              <Button size="sm" variant="ghost" onPress={() => setMode('custom')} className="justify-start text-gray-500">
                Custom range...
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <AppDatePicker label="Start date" value={start} onChange={setStart} max={end || todayStr} isRequired />
              <AppDatePicker label="End date" value={end} onChange={setEnd} max={todayStr} isRequired />
              
              {start > end && start !== '' && end !== '' && (
                <span className="text-xs text-red-500">Start date must be before end date.</span>
              )}
              {end > todayStr && (
                <span className="text-xs text-red-500">Cannot select future dates.</span>
              )}
              {isTooLong && (
                <span className="text-xs text-red-500">Date range cannot exceed 92 days.</span>
              )}

              <div className="tonnage-export-actions">
                <Button size="sm" variant="ghost" onPress={() => setMode('preset')}>Back</Button>
                <Button size="sm" variant="primary" className="bg-[#0B7A55] text-white" onPress={handleExport} isDisabled={!isValid} isPending={loading}>
                  Generate PDF
                </Button>
              </div>
            </div>
          )}
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
