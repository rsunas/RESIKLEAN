import { ListBox, Select } from '@heroui/react';
import { useEffect, useState } from 'react';

export default function AppSelect({
  'aria-label': ariaLabel,
  className = '',
  defaultValue = '',
  disabled = false,
  onChange,
  options,
  placeholder = 'Select one',
  value,
}) {
  const [internalValue, setInternalValue] = useState(value || defaultValue || '');
  const selectedKey = (value ?? internalValue) || null;

  useEffect(() => {
    if (value !== undefined) setInternalValue(value);
  }, [value]);

  const handleChange = (key) => {
    const nextValue = key == null ? '' : String(key);
    if (value === undefined) setInternalValue(nextValue);
    onChange?.(nextValue);
  };

  return (
    <Select
      aria-label={ariaLabel}
      className={`app-select ${className}`.trim()}
      isDisabled={disabled}
      onSelectionChange={handleChange}
      selectedKey={selectedKey}>
      <Select.Trigger>
        <Select.Value placeholder={placeholder} />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item id={option.value} key={option.value} textValue={option.label}>
              {option.label}
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
