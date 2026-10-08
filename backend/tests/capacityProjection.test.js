const { calculateProjection, MIN_STOPS } = require('../utils/capacityProjection');

describe('Capacity Projection Logic', () => {
  it('returns INSUFFICIENT_DATA when completedStops is less than MIN_STOPS', () => {
    const result = calculateProjection(50, MIN_STOPS - 1, 10);
    expect(result.status).toBe('INSUFFICIENT_DATA');
    expect(result.projection).toBeNull();
  });

  it('returns CRITICAL when actual fillLevel is >= 90 regardless of stops', () => {
    const result = calculateProjection(90, 2, 10);
    expect(result.status).toBe('CRITICAL');
    expect(result.projection).toBeNull();
  });

  it('returns CRITICAL with projection when actual fillLevel is >= 90 and stops >= MIN_STOPS', () => {
    const result = calculateProjection(90, 3, 10);
    expect(result.status).toBe('CRITICAL');
    expect(result.projection).toBe(300); // 90 * 10 / 3
  });

  it('returns CRITICAL when projection is > 100', () => {
    const result = calculateProjection(60, 5, 10);
    expect(result.status).toBe('CRITICAL');
    expect(result.projection).toBe(120); // 60 * 10 / 5
  });

  it('returns WARNING when projection is exactly 90', () => {
    const result = calculateProjection(45, 5, 10);
    expect(result.status).toBe('WARNING');
    expect(result.projection).toBe(90); // 45 * 10 / 5
  });

  it('returns WARNING when projection is between 90 and 100', () => {
    const result = calculateProjection(48, 5, 10);
    expect(result.status).toBe('WARNING');
    expect(result.projection).toBe(96); // 48 * 10 / 5
  });

  it('returns OK when projection is below 90', () => {
    const result = calculateProjection(40, 5, 10);
    expect(result.status).toBe('OK');
    expect(result.projection).toBe(80); // 40 * 10 / 5
  });

  it('rounds projection to 1 decimal place', () => {
    const result = calculateProjection(33, 3, 10);
    expect(result.projection).toBe(110); // 33 * 10 / 3 = 110
  });
});
