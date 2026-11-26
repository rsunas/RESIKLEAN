jest.mock('../src/services/notification.service', () => ({ sendUserPush: jest.fn(), sendPushNotifications: jest.fn() }));
jest.mock('../src/services/mapStaticImage', () => ({ getSegmentTrailImage: jest.fn().mockResolvedValue(null) }));
jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
const Session = require('../src/models/RouteTrailSession');
const Point = require('../src/models/RouteTrailPoint');
const Route = require('../src/models/Route');
const User = require('../src/models/User');
const RouteLog = require('../src/models/RouteLog');
const Cycle = require('../src/models/DailyCycleLog');
const { getRouteHistoryTrail, trailSegments } = require('../src/services/routeHistoryTrail');
const { getRouteHistoryDetail } = require('../src/controllers/admin.controller');
const { buildRouteHistoryPayload } = require('../src/services/pdf/routeHistoryReport');
const chain = data => { const q={}; for(const name of ['sort','limit','select','populate'])q[name]=jest.fn(()=>q); q.lean=async()=>data;return q; };
const driver='507f1f77bcf86cd799439011', routeId='507f1f77bcf86cd799439012';
const day='2026-10-07';
const sessions = [
 {clientSessionId:'old-a',startedAt:'2026-10-06T16:00:00Z',endedAt:'2026-10-06T17:00:00Z',status:'completed'},
 {clientSessionId:'old-b',startedAt:'2026-10-07T15:59:00Z',endedAt:'2026-10-07T17:00:00Z',status:'completed'},
 {clientSessionId:'next-day',startedAt:'2026-10-07T16:00:00Z',status:'completed'},
 ...[1,2,3].map(n=>({clientSessionId:`new-${n}`,startedAt:`2026-11-0${n}T00:00:00Z`,status:'completed'})),
];
const points=[
 ...Array.from({length:2100},(_,i)=>({clientSessionId:'old-a',longitude:123.18+i*.000001,latitude:13.62,recordedAt:new Date(Date.parse(sessions[0].startedAt)+i*1000)})),
 {clientSessionId:'old-b',longitude:123.2,latitude:13.65,recordedAt:'2026-10-07T16:05:00Z'},
 {clientSessionId:'old-b',longitude:123.21,latitude:13.66,recordedAt:'2026-10-07T16:10:00Z'},
];
let pointQuery,sessionQuery;
beforeEach(()=>{
 jest.spyOn(Session,'find').mockImplementation(filter=>{
  const rows=sessions.filter(s=>new Date(s.startedAt)>=filter.startedAt?.$gte&&new Date(s.startedAt)<filter.startedAt?.$lt);
  sessionQuery=chain(rows);return sessionQuery;
 });
 pointQuery=chain(points);jest.spyOn(Point,'find').mockReturnValue(pointQuery);
});
afterEach(()=>jest.restoreAllMocks());
test('selected Manila date includes all sessions, including overnight points, without newest-trip fallback',async()=>{
 const data=await getRouteHistoryTrail(driver,routeId,day);
 expect(data.sessions.map(s=>s.clientSessionId)).toEqual(['old-a','old-b']);
 expect(Session.find).toHaveBeenCalledWith({collectorId:driver,routeId,startedAt:{$gte:new Date('2026-10-06T16:00:00Z'),$lt:new Date('2026-10-07T16:00:00Z')}});
 expect(Point.find).toHaveBeenCalledWith({collectorId:driver,routeId,clientSessionId:{$in:['old-a','old-b']}});
 expect(sessionQuery.limit).not.toHaveBeenCalled();expect(pointQuery.limit).not.toHaveBeenCalled();
 expect(data.trailPoints).toHaveLength(2102);expect(data.session.startedAt).toBe(sessions[0].startedAt);expect(data.session.endedAt).toBe(sessions[1].endedAt);
});
test('no session on the selected date never borrows another date',async()=>{
 const data=await getRouteHistoryTrail(driver,routeId,'2026-09-01');expect(data.trailPoints).toEqual([]);expect(data.session).toBeNull();expect(Point.find).not.toHaveBeenCalled();
});
test('detail and PDF payload preserve disjoint lines even with no stop entries',async()=>{
 const route={_id:routeId,name:'Area 11',barangay:['Abella'],stops:[{name:'Stop 1'}],routePath:{type:'MultiLineString',coordinates:[[[123.1,13.5],[123.11,13.51]],[[123.3,13.7],[123.31,13.71]]]}};
 jest.spyOn(Route,'findById').mockReturnValue(chain(route));jest.spyOn(User,'findById').mockReturnValue(chain({name:'Driver'}));jest.spyOn(RouteLog,'find').mockReturnValue(chain([]));jest.spyOn(Cycle,'find').mockReturnValue(chain([]));
 const res={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);
 await getRouteHistoryDetail({params:{id:`${driver}|${routeId}|${day}`},user:{name:'Admin'}},res);
 const result=res.json.mock.calls[0][0];expect(result.success).toBe(true);expect(result.data.sessions).toHaveLength(2);
 expect(result.data.trail.coveredSegments.map(line=>line.length)).toEqual([2100,2]);
 expect(result.data.trail.expectedSegments.map(line=>line.length)).toEqual([2,2]);expect(result.data.recordSummary.geofenceEntry).toBe('Not logged');
 const pdf=buildRouteHistoryPayload({route,trailPoints:points,session:result.data.session,logs:[],eventDate:day}, {});expect(pdf.trail.coveredSegments).toEqual(result.data.trail.coveredSegments);
});
test('invalid coordinates split a trail instead of fabricating a line through a gap',()=>{
 const data=[{longitude:123,latitude:13},{longitude:null,latitude:13},{longitude:124,latitude:14},{longitude:124.1,latitude:14.1}];
 expect(trailSegments(data).map(line=>line.length)).toEqual([1,2]);
});

test('PDF export renders multiple uploaded trips without a map service',async()=>{
 const PDFDocument=require('pdfkit');
 const {generateRouteHistoryPDF}=require('../src/services/pdf/routeHistoryReport');
 const payload=buildRouteHistoryPayload({route:{name:'Test route',barangay:['Abella'],stops:[]},logs:[],trailPoints:points,eventDate:day},{});
 const doc=new PDFDocument({size:'LETTER',margin:46,bufferPages:true});const chunks=[];
 const finished=new Promise((resolve,reject)=>{doc.on('data',chunk=>chunks.push(chunk));doc.on('end',resolve);doc.on('error',reject);});
 await generateRouteHistoryPDF(doc,payload);await finished;
 const buffer=Buffer.concat(chunks);expect(buffer.subarray(0,4).toString()).toBe('%PDF');expect(buffer.length).toBeGreaterThan(1000);
});


test('history search and status filters run before pagination and return matching totals', async () => {
 const {getAllRouteHistory}=require('../src/controllers/admin.controller');
 jest.spyOn(Route,'find').mockReturnValue(chain([{_id:routeId,name:'Area 11',barangay:['Abella'],stops:[{name:'QA Street'}]}]));
 jest.spyOn(RouteLog,'find').mockReturnValue(chain(Array.from({length:12},(_,i)=>({
  routeId,collectorId:{_id:driver,name:i<9?'Other driver':'Target driver'},eventDate:`2026-11-${String(i+1).padStart(2,'0')}`,
  status:'collected',collectedAt:'2026-11-01T04:00:00Z',flaggedForReview:i===11,
 }))));
 Session.find.mockReturnValue(chain([]));
 jest.spyOn(Cycle,'find').mockReturnValue(chain([]));
 const request=async query=>{const res={status:jest.fn(),json:jest.fn()};res.status.mockReturnValue(res);await getAllRouteHistory({query},res);const result=res.json.mock.calls[0][0];expect(result.success).toBe(true);return result.data;};
 const first=await request({q:'target DRIVER',limit:'2',page:'1'});
 expect(first.count).toBe(3);expect(first.pages).toBe(2);expect(first.rows).toHaveLength(2);expect(first.rows.every(row=>row.collector==='Target driver')).toBe(true);
 const second=await request({q:'target driver',limit:'2',page:'2'});expect(second.rows).toHaveLength(1);expect(first.rows.map(row=>row.id)).not.toContain(second.rows[0].id);
 const flagged=await request({q:'Target',status:'flagged',limit:'7'});expect(flagged.count).toBe(1);expect(flagged.rows[0].flaggedCount).toBe(1);
 const empty=await request({q:'no matching record',limit:'7'});expect(empty.count).toBe(0);expect(empty.rows).toEqual([]);
});

test('GPS endpoint coordinates never use stop-geofence positions or grouped line order', () => {
 const input = {eventDate:day, route:{stops:[]}, sessions:[{endedAt:'2026-10-07T03:00:00Z'}],
  logs:[{collectedAt:'2026-10-07T01:20:00Z',exitedAt:'2026-10-07T01:21:00Z',latitude:1,longitude:2}],
  trailPoints:[
   {clientSessionId:'a',longitude:123,latitude:13,recordedAt:'2026-10-07T01:00:00Z'},
   {clientSessionId:'a',longitude:124,latitude:14,recordedAt:'2026-10-07T02:00:00Z'},
   {clientSessionId:'b',longitude:123.5,latitude:13.5,recordedAt:'2026-10-07T01:30:00Z'}]};
 const result=buildRouteHistoryPayload(input,{});
 expect(result.trail.startCoord).toEqual([123,13]); expect(result.trail.endCoord).toEqual([124,14]);
 expect(result.trail.tripEnded).toBe(true);
 expect(result.trail.entryTime).toBe(input.logs[0].collectedAt);
 expect(result.trail.exitTime).toBe(input.logs[0].exitedAt);
 const empty=buildRouteHistoryPayload({...input,trailPoints:[]},{});
 expect(empty.trail.startCoord).toBeNull();expect(empty.trail.endCoord).toBeNull();
});
