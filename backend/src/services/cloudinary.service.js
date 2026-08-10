// Cloudinary Service
// Handles photo uploads for missed-collection reports
// TODO: implement in media-storage sprint

/**
 * Upload a base64 or stream image to Cloudinary.
 * @param {string} fileBuffer - file buffer or base64 string
 * @param {string} folder     - Cloudinary folder name
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadPhoto = async (fileBuffer, folder = 'resiklean/reports') => {
  // const cloudinary = require('../config/cloudinary');
  // const result = await cloudinary.uploader.upload(fileBuffer, { folder });
  // return { url: result.secure_url, publicId: result.public_id };
  throw new Error('Cloudinary not configured yet — fill in CLOUDINARY_* in .env');
};

module.exports = { uploadPhoto };
