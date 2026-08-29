// Roboflow Service
// Sends photo to Roboflow Serverless API for AI verification of waste/trashbag
const axios = require('axios');

const ROBOFLOW_API_KEY = process.env.ROBOFLOW_API_KEY;
const ROBOFLOW_MODEL = process.env.ROBOFLOW_MODEL || 'waste-r2iqz/2';

/**
 * Verify a waste photo using the Roboflow model.
 * Downloads the image from Cloudinary, converts to base64,
 * then sends to Roboflow Serverless API for detection.
 *
 * @param {string} imageUrl - public image URL (e.g., from Cloudinary)
 * @returns {Promise<{verified: boolean, confidence: number, predictions: Array}>}
 */
const verifyWastePhoto = async (imageUrl) => {
  if (!ROBOFLOW_API_KEY) {
    console.warn('⚠️  ROBOFLOW_API_KEY not set — skipping AI verification');
    return { verified: false, confidence: 0, detectedBagCount: 0, predictions: [] };
  }

  try {
    // Step 1: Download image from Cloudinary and convert to base64
    const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
    const base64Image = Buffer.from(imageResponse.data).toString('base64');

    // Step 2: Send to Roboflow Serverless API (inference v1.5.0+)
    const response = await axios({
      method: 'POST',
      url: `https://serverless.roboflow.com/${ROBOFLOW_MODEL}`,
      headers: {
        'Authorization': `Bearer ${ROBOFLOW_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      data: base64Image,
    });

    const predictions = response.data.predictions || [];

    // Check if any trashbag was detected with confidence >= 50%
    const trashDetections = predictions.filter(
      (p) => p.confidence >= 0.5
    );

    const topPrediction = trashDetections.sort(
      (a, b) => b.confidence - a.confidence
    )[0];

    return {
      verified: trashDetections.length > 0,
      confidence: topPrediction?.confidence ?? 0,
      detectedBagCount: trashDetections.length,
      predictions: trashDetections,
    };
  } catch (err) {
    console.error('Roboflow API error:', err.message);
    // Don't block the report — just mark as unverified
    return { verified: false, confidence: 0, detectedBagCount: 0, predictions: [] };
  }
};

module.exports = { verifyWastePhoto };
