import { Button, DateField, DateRangePicker, Label, RangeCalendar } from '@heroui/react';
import { today } from '@internationalized/date';
import { useState } from 'react';
import { tonnagePreset, tonnageRangeError } from './tonnageDates';
import './TonnageDateFilter.css';

export default function TonnageDateFilter({ value, onChange, loading = false }) {
  const [draft, setDraft] = useState(value);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const error = tonnageRangeError(draft);
  return <form className="tonnage-date-filter" onSubmit={event => { event.preventDefault(); if (!error) onChange(draft); }}>
    <div className="tonnage-date-controls">
      {loading ? <Button isDisabled variant="secondary" className="tonnage-date-loading">Select dates</Button> : <DateRangePicker isOpen={calendarOpen} onOpenChange={setCalendarOpen} className="tonnage-date-picker" value={draft} onChange={setDraft} maxValue={today('Asia/Manila')} isRequired validationBehavior="native" isInvalid={!!error} aria-describedby={error ? 'tonnage-date-error' : undefined}>
        <Label className="tonnage-date-label">Collection dates</Label>
        <DateField.Group>
          <DateField.InputContainer>
            <DateField.Input slot="start">{segment => <DateField.Segment segment={segment} />}</DateField.Input>
            <DateRangePicker.RangeSeparator />
            <DateField.Input slot="end">{segment => <DateField.Segment segment={segment} />}</DateField.Input>
          </DateField.InputContainer>
          <DateField.Suffix><DateRangePicker.Trigger aria-label="Choose collection dates"><DateRangePicker.TriggerIndicator /></DateRangePicker.Trigger></DateField.Suffix>
        </DateField.Group>
        <DateRangePicker.Popover className="tonnage-calendar-popover" placement="bottom end">
          <div className="tonnage-calendar-layout">
    <div className="tonnage-date-presets" aria-label="Quick date ranges">
      {[['week', 'Last 7 days'], ['thirty', 'Last 30 days'], ['month', 'This month']].map(([key, label]) => {
        const range = tonnagePreset(key);
        const selected = value.start.compare(range.start) === 0 && value.end.compare(range.end) === 0;
        return <Button key={key} type="button" size="sm" variant="secondary" aria-pressed={selected} onPress={() => { setDraft(range); onChange(range); setCalendarOpen(false); }}>{label}</Button>;
      })}
    </div>

          <RangeCalendar maxValue={today('Asia/Manila')} aria-label="Collection date range">
            <RangeCalendar.Header><RangeCalendar.NavButton slot="previous" /><RangeCalendar.Heading /><RangeCalendar.NavButton slot="next" /></RangeCalendar.Header>
            <RangeCalendar.Grid>
              <RangeCalendar.GridHeader>{day => <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>}</RangeCalendar.GridHeader>
              <RangeCalendar.GridBody>{date => <RangeCalendar.Cell date={date} />}</RangeCalendar.GridBody>
            </RangeCalendar.Grid>
          </RangeCalendar>
          </div>
        </DateRangePicker.Popover>
      </DateRangePicker>}
      <Button type="submit" className="tonnage-apply" isDisabled={loading || !!error}>Apply dates</Button>
    </div>
    {error ? <p id="tonnage-date-error" className="tonnage-date-error" role="alert">{error}</p> : null}

  </form>;
}
