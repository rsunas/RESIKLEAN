const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { TRUCK_DIMENSION_LIMITS, validateTruckDimensions } = require('../src/utils/truckDimensions');
const Truck = require('../src/models/Truck');
const TruckLoad = require('../src/models/TruckLoad');

// Evaluate the small browser utility without adding an ESM runner dependency.
const browserSource = fs.readFileSync(path.join(__dirname, '../../web-dashboard/src/utils/truckDimensions.js'), 'utf8');
const browser = vm.runInNewContext(`${browserSource.replace(/export /g, '')}\n({ TRUCK_DIMENSION_LIMITS, validateTruckDimensions })`);

describe('approved metre dimension guardrails', () => {
  const valid = { length: 4.5, width: 2, height: 1.8 };
  test('browser and API use identical limits', () => {
    expect(browser.TRUCK_DIMENSION_LIMITS).toEqual(TRUCK_DIMENSION_LIMITS);
  });
  for (const [field, { min, max }] of Object.entries(TRUCK_DIMENSION_LIMITS)) {
    test.each([min, max, String(min), String(max)])(`${field} accepts boundary %s`, (value) => {
      const input = { ...valid, [field]: value };
      expect(validateTruckDimensions(input)).toBeNull();
      expect(browser.validateTruckDimensions(input)).toBeNull();
    });
    test.each([min - 0.01, max + 0.01, 450, '', ' ', 'oops', null, undefined, Infinity, NaN, true])(`${field} rejects %s`, (value) => {
      const input = { ...valid, [field]: value };
      expect(validateTruckDimensions(input)).toMatch(/metres/);
      expect(browser.validateTruckDimensions(input)).toBe(validateTruckDimensions(input));
    });
    test(`${field} limits also exist on both database schemas`, () => {
      for (const Model of [Truck, TruckLoad]) {
        const doc = new Model({ ...valid, [field]: max + 1 });
        expect(doc.validateSync().errors[field]).toBeDefined();
        expect(Model.schema.path(field).options.min).toBe(min);
        expect(Model.schema.path(field).options.max).toBe(max);
      }
    });
  }
  test('partial registry updates validate only supplied dimensions', () => {
    expect(validateTruckDimensions({}, { partial: true })).toBeNull();
    expect(validateTruckDimensions({ width: 200 }, { partial: true })).toMatch(/Width/);
    expect(validateTruckDimensions({ width: null }, { partial: true })).toMatch(/Width/);
    expect(validateTruckDimensions({ width: 2 }, { partial: true })).toBeNull();
  });
  test('rejects centimetre-shaped fixtures without changing their values', () => {
    const input = { length: 450, width: 200, height: 180 };
    const snapshot = { ...input };
    expect(validateTruckDimensions(input)).not.toBeNull();
    expect(input).toEqual(snapshot);
  });
});
