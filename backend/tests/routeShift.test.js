const Route = require('../src/models/Route');
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
const { createRoute, updateRoute } = require('../src/controllers/admin.controller');

const body = { name: 'Area 1', barangay: ['Abella'], schedule: [1], routePath: { type: 'LineString', coordinates: [[123.18, 13.62], [123.19, 13.63]] }, stops: [{ name: 'Stop', order: 1, longitude: 123.18, latitude: 13.62 }] };
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res; };
afterEach(() => jest.restoreAllMocks());

test.each(['AM', 'PM', null])('schema accepts optional shift %s', (shift) => {
  expect(new Route({ ...body, shift }).validateSync()).toBeUndefined();
});
test('legacy routes remain unset and invalid periods are rejected', () => {
  expect(new Route(body).shift).toBeNull();
  expect(new Route({ ...body, shift: 'Night' }).validateSync().errors.shift).toBeDefined();
});
test.each(['AM', 'PM', null])('create persists shift %s', async (shift) => {
  const saved = { ...body, _id: 'route-1', shift };
  jest.spyOn(Route, 'create').mockResolvedValue(saved);
  jest.spyOn(Route, 'findById').mockReturnValue({ populate: () => ({ lean: async () => saved }) });
  const res = response();
  await createRoute({ body: { ...body, shift } }, res);
  expect(Route.create).toHaveBeenCalledWith(expect.objectContaining({ shift }));
  expect(res.status).toHaveBeenCalledWith(201);
});
test.each(['AM', 'PM', null, undefined])('update handles shift %s without touching assignment', async (shift) => {
  const route = { ...body, shift: 'PM', collectorId: 'driver-1', save: jest.fn().mockResolvedValue() };
  jest.spyOn(Route, 'findById').mockReturnValueOnce(route).mockReturnValueOnce({ populate: () => ({ lean: async () => route }) });
  const res = response();
  await updateRoute({ params: { routeId: 'route-1' }, body: shift === undefined ? { name: 'Updated' } : { shift } }, res);
  expect(route.shift).toBe(shift === undefined ? 'PM' : shift);
  expect(route.collectorId).toBe('driver-1');
  expect(route.save).toHaveBeenCalled();
});
test('API rejects invalid shifts before saving', async () => {
  const route = { save: jest.fn() };
  jest.spyOn(Route, 'findById').mockResolvedValue(route);
  const createRes = response(), updateRes = response();
  await createRoute({ body: { ...body, shift: 'night' } }, createRes);
  await updateRoute({ params: { routeId: 'route-1' }, body: { shift: 'night' } }, updateRes);
  expect(createRes.status).toHaveBeenCalledWith(400);
  expect(updateRes.status).toHaveBeenCalledWith(400);
  expect(route.save).not.toHaveBeenCalled();
});
