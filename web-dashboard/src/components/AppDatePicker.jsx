import { Button, Calendar, DateField, DatePicker, FieldError, Label } from '@heroui/react';
import { parseDate } from '@internationalized/date';
import { useState } from 'react';
import './AppDatePicker.css';

function calendarDate(value) {
  if (!value) return null;
  try { return parseDate(value); } catch { return null; }
}

// Keep API-facing values as YYYY-MM-DD strings while HeroUI owns the calendar and keyboard editing.
export default function AppDatePicker({ value, onChange, label, ariaLabel = label, id, min, max, isRequired = false, isDisabled = false, isInvalid, className = '', hideLabel = false }) {
  const [yearPickerOpen, setYearPickerOpen] = useState(false);
  return <DatePicker isDisabled={isDisabled} id={id} aria-label={ariaLabel} className={`app-date-picker ${className}`} value={calendarDate(value)} onChange={date => onChange(date?.toString() || '')} minValue={calendarDate(min) || undefined} maxValue={calendarDate(max) || undefined} isRequired={isRequired} isInvalid={isInvalid} validationBehavior="native" onOpenChange={() => setYearPickerOpen(false)}>
    <Label className={hideLabel ? 'app-date-label-hidden' : undefined}>{label}</Label>
    <DateField.Group>
      <DateField.Input>{segment => <DateField.Segment segment={segment} />}</DateField.Input>
      <DateField.Suffix>
        {!isRequired && value ? <Button isDisabled={isDisabled} isIconOnly variant="ghost" className="app-date-clear" aria-label={`Clear ${ariaLabel}`} onPress={() => onChange('')}>{'\u00d7'}</Button> : null}
        <DatePicker.Trigger aria-label={`Choose ${ariaLabel}`}><DatePicker.TriggerIndicator /></DatePicker.Trigger>
      </DateField.Suffix>
    </DateField.Group>
    <FieldError />
    <DatePicker.Popover className="app-calendar-popover" placement="bottom start">
      <Calendar minValue={calendarDate(min) || undefined} maxValue={calendarDate(max) || undefined} aria-label={ariaLabel} isYearPickerOpen={yearPickerOpen} onYearPickerOpenChange={setYearPickerOpen}>
        <Calendar.Header><Calendar.NavButton slot="previous" /><Calendar.YearPickerTrigger><Calendar.YearPickerTriggerHeading /><Calendar.YearPickerTriggerIndicator /></Calendar.YearPickerTrigger><Calendar.NavButton slot="next" /></Calendar.Header>
        {yearPickerOpen ? <Calendar.YearPickerGrid><Calendar.YearPickerGridBody>{({ year }) => <Calendar.YearPickerCell year={year} />}</Calendar.YearPickerGridBody></Calendar.YearPickerGrid> : <Calendar.Grid><Calendar.GridHeader>{day => <Calendar.HeaderCell>{day}</Calendar.HeaderCell>}</Calendar.GridHeader><Calendar.GridBody>{date => <Calendar.Cell date={date} />}</Calendar.GridBody></Calendar.Grid>}
      </Calendar>
    </DatePicker.Popover>
  </DatePicker>;
}
