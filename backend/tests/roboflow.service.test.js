process.env.ROBOFLOW_API_KEY = 'test-key';
const axios = require('axios');
const { verifyWastePhoto } = require('../src/services/roboflow.service');

jest.mock('axios');

describe('Roboflow Service - verifyWastePhoto', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should return detectedBagCount and verified true when AI detects trashbags', async () => {
    // Mock the image download
    axios.get.mockResolvedValueOnce({ data: Buffer.from('fake-image-data') });

    // Mock the Roboflow API response
    axios.mockResolvedValueOnce({
      data: {
        predictions: [
          { confidence: 0.85, class: 'trashbag' },
          { confidence: 0.60, class: 'trashbag' },
          { confidence: 0.40, class: 'trashbag' }, // Ignored because < 0.5
        ],
      },
    });

    const result = await verifyWastePhoto('http://fakeurl.com/image.jpg');

    expect(result.verified).toBe(true);
    expect(result.confidence).toBe(0.85);
    expect(result.detectedBagCount).toBe(2);
    expect(result.predictions).toHaveLength(2);
  });

  it('should return verified false and 0 bags when API call fails (graceful degradation)', async () => {
    // Mock the image download
    axios.get.mockResolvedValueOnce({ data: Buffer.from('fake-image-data') });

    // Mock the Roboflow API response to fail
    axios.mockRejectedValueOnce(new Error('Roboflow API Down'));

    const result = await verifyWastePhoto('http://fakeurl.com/image.jpg');

    expect(result.verified).toBe(false);
    expect(result.confidence).toBe(0);
    expect(result.detectedBagCount).toBe(0);
    expect(result.predictions).toHaveLength(0);
  });
});
