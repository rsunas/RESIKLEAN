export const WASTE_CATEGORY_OPTIONS = [
  { value: 'biodegradable', label: 'Biodegradable' },
  { value: 'non-biodegradable', label: 'Non-biodegradable' },
  { value: 'recyclable', label: 'Recyclable' },
  { value: 'hazardous', label: 'Hazardous' },
];

export function wasteCategoryLabel(value?: string | null): string {
  return WASTE_CATEGORY_OPTIONS.find(option => option.value === value)?.label ?? 'Not specified';
}
