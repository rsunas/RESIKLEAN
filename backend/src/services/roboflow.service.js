// Roboflow Service
// Sends photo to Roboflow YOLOv8s model for AI verification
// TODO: implement in computer-vision sprint

/**
 * Verify a waste photo using the Roboflow model.
 * @param {string} imageUrl - public image URL (e.g., from Cloudinary)
 * @returns {Promise<{verified: boolean, confidence: number}>}
 */
const verifyWastePhoto = async (imageUrl) => {
  // const axios = require('axios');
  // const response = await axios.post(
  //   `https://detect.roboflow.com/${process.env.ROBOFLOW_MODEL}`,
  //   { image: imageUrl },
  //   { params: { api_key: process.env.ROBOFLOW_API_KEY } }
  // );
  // const topPrediction = response.data.predictions[0];
  // return { verified: !!topPrediction, confidence: topPrediction?.confidence ?? 0 };
  throw new Error('Roboflow not configured yet — fill in ROBOFLOW_* in .env');
};

module.exports = { verifyWastePhoto };
