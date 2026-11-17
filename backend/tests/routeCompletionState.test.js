const Route = require('../src/models/Route');
const Session = require('../src/models/RouteTrailSession');
const DailyCycleLog = require('../src/models/DailyCycleLog');
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
const { getAssignedRoute } = require('../src/controllers/collector.controller');

const chain = data => {
  const query = {};
  for (const method of ['select', 'sort', 'populate']) query[method] = () => query;
  query.lean = async () => data;
  return query;
};
afterEach(() => jest.restoreAllMocks());

test.each([false, true])('assignment completion requires explicit route confirmation: %s', async confirmed => {
  const session = { status: 'completed', startedAt: new Date(), ...(confirmed ? { routeCompletedAt: new Date() } : {}) };
  jest.spyOn(Route, 'findOne').mockReturnValue(chain({ _id: 'route', schedule: [0, 1, 2, 3, 4, 5, 6], stops: [] }));
  jest.spyOn(DailyCycleLog, 'findOne').mockReturnValue(chain(null));
  jest.spyOn(Session, 'findOne').mockImplementation(filter => {
    // Model Mongo's date-type filter against a stopped recording with/without confirmation.
    return chain(filter.routeCompletedAt?.$type === 'date' && !session.routeCompletedAt ? null : session);
  });
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  await getAssignedRoute({ user: { _id: 'driver' } }, res);
  expect(res.json.mock.calls[0][0].data.isCompletedToday).toBe(confirmed);
});
