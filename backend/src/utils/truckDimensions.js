// Approved load-space limits, in metres. Never infer units or convert inputs.
const TRUCK_DIMENSION_LIMITS = Object.freeze({
  length: { min: 1, max: 12 },
  width: { min: 1, max: 3 },
  height: { min: 0.3, max: 4 },
});

function validateTruckDimensions(input, { partial = false } = {}) {
  for (const [field, { min, max }] of Object.entries(TRUCK_DIMENSION_LIMITS)) {
    const raw = input[field];
    if (partial && raw === undefined) continue;
    const number = (typeof raw === 'number' || (typeof raw === 'string' && raw.trim())) ? Number(raw) : NaN;
    if (!Number.isFinite(number) || number < min || number > max) {
      return `${field[0].toUpperCase()}${field.slice(1)} must be between ${min} and ${max} metres. Enter metres, not centimetres.`;
    }
  }
  return null;
}

function dimensionSchema(field) {
  const { min, max } = TRUCK_DIMENSION_LIMITS[field];
  return { type: Number, required: true, min, max };
}

module.exports = { TRUCK_DIMENSION_LIMITS, validateTruckDimensions, dimensionSchema };
