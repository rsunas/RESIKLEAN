const cloudinary = require('../config/cloudinary');

/**
 * Upload an image buffer to Cloudinary.
 * @param {Buffer} fileBuffer - the raw file buffer from multer
 * @param {string} folder     - Cloudinary folder name
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadPhoto = (fileBuffer, folder = 'resiklean/reports') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id });
      }
    );
    stream.end(fileBuffer);
  });
};

/**
 * Delete an image from Cloudinary by its public ID.
 * @param {string} publicId
 */
const deletePhoto = async (publicId) => {
  await cloudinary.uploader.destroy(publicId);
};

module.exports = { uploadPhoto, deletePhoto };
