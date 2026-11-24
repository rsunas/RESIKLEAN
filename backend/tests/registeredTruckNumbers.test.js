const Truck = require('../src/models/Truck');
const { attachTruckNumbers, normalizePlate } = require('../src/utils/registeredTruckNumbers');

afterEach(() => jest.restoreAllMocks());

test('attaches truck numbers from the registry to legacy loads with differently formatted plates', async () => {
  jest.spyOn(Truck, 'find').mockReturnValue({
    select: () => ({
      lean: async () => [{ plateNumber: 'SEA-2342', truckNumber: '50' }],
    }),
  });
  const loads = [
    { truckPlate: ' sea 2342 ' },
    { truckPlate: 'SEA-0000' },
    { truckPlate: 'OTHER-123', truckNumber: '51' },
  ];

  await attachTruckNumbers(loads);
  expect(loads.map(load => load.truckNumber || null)).toEqual(['50', null, '51']);
  expect(normalizePlate(' sea 2342 ')).toBe('SEA2342');
});