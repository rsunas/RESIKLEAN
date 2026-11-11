// Keep aligned with backend/src/utils/truckDimensions.js (metres).
export const TRUCK_DIMENSION_LIMITS = {
  length: { min: 1, max: 12 },
  width: { min: 1, max: 3 },
  height: { min: 0.3, max: 4 },
};

export function validateTruckDimensions(input) {
  for (const [field, { min, max }] of Object.entries(TRUCK_DIMENSION_LIMITS)) {
    const raw = input[field];
    const value = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim())) ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < min || value > max) {
      return `${field[0].toUpperCase()}${field.slice(1)} must be between ${min} and ${max} metres. Enter metres, not centimetres.`;
    }
  }
  return null;
}
