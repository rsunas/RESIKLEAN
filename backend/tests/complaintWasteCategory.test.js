jest.mock('../src/services/cloudinary.service', () => ({ uploadPhoto: jest.fn() }));
jest.mock('../src/services/roboflow.service', () => ({ verifyWastePhoto: jest.fn() }));
jest.mock('../src/services/socket.service', () => ({ emitToComplaint: jest.fn() }));
const MissedReport = require('../src/models/MissedReport');
const categories = require('../src/utils/wasteCategories');
const { submitReport, getMyReports } = require('../src/controllers/resident.controller');
const { getAllReports } = require('../src/controllers/admin.controller');
const { uploadPhoto } = require('../src/services/cloudinary.service');
const { verifyWastePhoto } = require('../src/services/roboflow.service');
const socket = require('../src/services/socket.service');
const mongoose = require('mongoose');
const residentId = new mongoose.Types.ObjectId();
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });
const request = wasteCategory => ({ user: { _id: residentId, barangay: 'Abella' }, body: { description: 'Missed collection', ...(wasteCategory === undefined ? {} : { wasteCategory }) }, file: { buffer: Buffer.from('proof'), size: 10, mimetype: 'image/jpeg' } });

afterEach(() => jest.restoreAllMocks());
beforeEach(() => {
  jest.clearAllMocks();
  uploadPhoto.mockResolvedValue({ url: 'https://example.com/proof.jpg' });
  verifyWastePhoto.mockResolvedValue({ verified: true, confidence: 0.8, detectedBagCount: 2 });
});

test.each(categories)('saves %s and returns it to residents, admins and live subscribers', async wasteCategory => {
  // Use the actual schema so strict-mode field stripping cannot hide a missing schema field.
  let stored;
  jest.spyOn(MissedReport, 'create').mockImplementation(async data => {
    const document = new MissedReport(data);
    await document.validate();
    stored = document.toObject();
    return stored;
  });
  const res = response();
  await submitReport(request(wasteCategory), res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(stored).toMatchObject({ wasteCategory, description: 'Missed collection', photoUrl: 'https://example.com/proof.jpg', detectedBagCount: 2 });
  expect(res.json.mock.calls[0][0].data.wasteCategory).toBe(wasteCategory);
  expect(socket.emitToComplaint).toHaveBeenCalledWith('complaint:created', residentId, expect.objectContaining({ report: expect.objectContaining({ wasteCategory }) }));
  const query = { populate: jest.fn().mockReturnThis(), sort: jest.fn().mockReturnThis(), lean: jest.fn().mockResolvedValue([stored]) };
  const find = jest.spyOn(MissedReport, 'find').mockReturnValue(query);
  const residentResponse = response();
  await getMyReports({ user: { _id: residentId }, query: {} }, residentResponse);
  expect(find).toHaveBeenCalledWith({ residentId });
  expect(residentResponse.json.mock.calls[0][0].data[0].wasteCategory).toBe(wasteCategory);
  const adminResponse = response();
  await getAllReports({ query: {} }, adminResponse);
  expect(adminResponse.json.mock.calls[0][0].data.reports[0].wasteCategory).toBe(wasteCategory);
});

test.each(['', 'organic', 'Recyclable', ['hazardous'], { value: 'hazardous' }, null])('rejects invalid category %j before photo upload', async category => {
  const create = jest.spyOn(MissedReport, 'create');
  const res = response();
  await submitReport(request(category), res);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(uploadPhoto).not.toHaveBeenCalled();
  expect(create).not.toHaveBeenCalled();
  expect(socket.emitToComplaint).not.toHaveBeenCalled();
});

test('accepts legacy submissions without a category without inventing one', async () => {
  jest.spyOn(MissedReport, 'create').mockImplementation(async data => {
    const document = new MissedReport(data); await document.validate(); return document.toObject();
  });
  const res = response(); await submitReport(request(undefined), res);
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.json.mock.calls[0][0].data.wasteCategory).toBeUndefined();
});

test('schema rejects invalid categories even outside the submission controller', () => {
  const report = new MissedReport({ residentId, barangay: 'Abella', wasteCategory: 'organic' });
  expect(report.validateSync().errors.wasteCategory).toBeDefined();
});
