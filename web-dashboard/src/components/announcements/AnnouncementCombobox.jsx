import { useEffect, useState } from 'react';
import { ComboBox, Input, Label, ListBox } from '@heroui/react';

export default function AnnouncementCombobox({ label, value, options, onChange, custom = false, disabled }) {
  const selected = options.find(option => option.value === value);
  const selectedLabel = selected?.label || '';
  const [search, setSearch] = useState(selectedLabel);
  useEffect(() => { setSearch(selectedLabel); }, [selectedLabel]);

  return <ComboBox className="ann-field ann-combobox" fullWidth
    allowsCustomValue={custom} allowsEmptyCollection defaultItems={options}
    selectedKey={custom || search === selectedLabel ? selected?.value ?? null : null} inputValue={custom ? value : search}
    isDisabled={disabled}
    onInputChange={text => { if (custom) onChange(text); else setSearch(text); }}
    onSelectionChange={key => { if (key != null) onChange(String(key)); }}
    onBlur={() => { if (!custom) setSearch(selectedLabel); }}>
    <Label>{label}</Label>
    <ComboBox.InputGroup>
      <Input maxLength={custom ? 80 : undefined} placeholder={custom ? 'Type or choose an option' : 'Search...'} />
      <ComboBox.Trigger aria-label={`Show ${label} suggestions`} />
    </ComboBox.InputGroup>
    <ComboBox.Popover className="ann-combobox-popover">
      <ListBox renderEmptyState={() => <span className="ann-combobox-empty">{custom ? 'Use your entered text' : 'No matches'}</span>}>
        {option => <ListBox.Item id={option.value} textValue={option.label}>
          {option.label}<ListBox.ItemIndicator />
        </ListBox.Item>}
      </ListBox>
    </ComboBox.Popover>
  </ComboBox>;
}
