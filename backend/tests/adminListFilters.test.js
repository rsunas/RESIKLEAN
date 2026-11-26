jest.mock('../src/services/notification.service', () => ({ sendUserPush: jest.fn(), sendPushNotifications: jest.fn() }));
const { textSearch, escapeSearch, dateRange } = require('../src/utils/adminListFilters');
const { buildFeedPipeline } = require('../src/services/adminNotifications');
const Announcement = require('../src/models/Announcement');
const Truck = require('../src/models/Truck');
const controller = require('../src/controllers/announcement.controller');
const id='507f1f77bcf86cd799439011';
afterEach(()=>jest.restoreAllMocks());
test('literal search and inclusive Manila days reject malformed inputs',()=>{
  for(const value of ['.*','[a]','(name)?','a+b','^name$','{x}','a\\b']) {
    const regex=new RegExp(escapeSearch(value),'i'); expect(regex.test(value)).toBe(true); expect(regex.test('unrelated')).toBe(false);
  }
  expect(textSearch('  Dinaga  ')).toBe('Dinaga');
  const dates=dateRange('2026-11-26','2026-11-26');
  expect(dates.$gte.toISOString()).toBe('2026-11-25T16:00:00.000Z');
  expect(dates.$lt.toISOString()).toBe('2026-11-26T16:00:00.000Z');
  for(const args of [['2026-02-30',''],['2026-11-27','2026-11-26'],[[], '']]) expect(()=>dateRange(...args)).toThrow();
  for(const value of [{},[], 'x'.repeat(201)]) expect(()=>textSearch(value)).toThrow();
});
test('notification text/date/category/read filters precede both count and pagination; unread badge stays global',()=>{
  const pipeline=buildFeedPipeline(id,{q:'Peter.*',type:'route',unread:true,from:'2026-11-26',to:'2026-11-26',page:3,limit:4});
  expect(pipeline.some(step=>step.$lookup?.as==='searchActor')).toBe(true);
  const facet=pipeline.at(-1).$facet,match=facet.items[0].$match;
  expect(match).toMatchObject({type:'route',read:false});
  expect(match.$or.find(item=>item['searchActor.name'])['searchActor.name'].test('Peter.*')).toBe(true);
  expect(match.$or.find(item=>item['searchActor.name'])['searchActor.name'].test('Peter Parker')).toBe(false);
  expect(facet.total[0].$match).toEqual(match);
  expect(facet.items[2]).toEqual({$skip:8});
  expect(facet.unread).toEqual([{$match:{read:false}},{$count:'count'}]);
});
const response=()=>({status:jest.fn().mockReturnThis(),json:jest.fn()});
test('announcements combine search/status/area/truck/dates before counting and slicing',async()=>{
  const chain={};for(const key of ['populate','sort','skip','limit'])chain[key]=jest.fn(()=>chain);chain.lean=async()=>[];
  const find=jest.spyOn(Announcement,'find').mockReturnValue(chain);
  const count=jest.spyOn(Announcement,'countDocuments').mockResolvedValue(35);
  jest.spyOn(Truck,'find').mockReturnValue({select:()=>({lean:async()=>[{_id:id}]})});
  const res=response();
  await controller.list({user:{role:'admin'},query:{q:'57',status:'draft',area:id,truck:'global',from:'2026-11-26',to:'2026-11-26',page:'4',limit:'10'}},res);
  const match=find.mock.calls[0][0];
  expect(match).toMatchObject({status:'draft',areaId:id,affectedTruckId:null,scheduledFor:dateRange('2026-11-26','2026-11-26')});
  expect(match.$or).toContainEqual({affectedTruckId:{$in:[id]}});
  expect(count).toHaveBeenCalledWith(match);expect(chain.skip).toHaveBeenCalledWith(30);expect(chain.limit).toHaveBeenCalledWith(10);
  expect(res.json.mock.calls[0][0].data.total).toBe(35);
});
test('invalid announcement filters return 400 without database calls',async()=>{
  const count=jest.spyOn(Announcement,'countDocuments');
  for(const query of [{q:[]},{status:'bad'},{area:'bad'},{truck:'bad'},{from:'2026-02-30'},{from:'2026-11-27',to:'2026-11-26'}]){
    const res=response();await controller.list({user:{role:'admin'},query},res);expect(res.status).toHaveBeenCalledWith(400);
  }
  expect(count).not.toHaveBeenCalled();
});
