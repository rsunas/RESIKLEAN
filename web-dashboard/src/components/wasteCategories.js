const labels = {
  'biodegradable': 'Biodegradable',
  'non-biodegradable': 'Non-biodegradable',
  'recyclable': 'Recyclable',
  'hazardous': 'Hazardous',
};

export function wasteCategoryLabel(value) {
  return Object.hasOwn(labels, value) ? labels[value] : 'Not specified';
}
