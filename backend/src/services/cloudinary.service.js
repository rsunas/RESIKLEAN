const cloudinary = require('../config/cloudinary');

/**
 * Upload an image buffer to Cloudinary.
 * @param {Buffer} fileBuffer - the raw file buffer from multer
 * @param {string} folder     - Cloudinary folder name
 * @returns {Promise<{url: string, publicId: string}>}
 */
const uploadPhoto = (fileBuffer, folder = 'resiklean/reports', options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', ...options },
      (error, result) => {
        if (error) return reject(error);
        resolve({ url: result.secure_url, publicId: result.public_id, format: result.format });
      }
    );
    stream.end(fileBuffer);
  });
};

/**
 * Delete an image from Cloudinary by its public ID.
 * @param {string} publicId
 */
const deletePhoto = async (publicId, options = {}) => {
  await cloudinary.uploader.destroy(publicId, options);
};

// Only call after authorizing an administrator; this URL expires after two minutes.
const getIdentityPhotoUrl = (photo) => cloudinary.utils.private_download_url(photo.publicId, photo.format, {
  resource_type: 'image', type: 'authenticated', attachment: false,
  expires_at: Math.floor(Date.now() / 1000) + 120,
});
module.exports = { uploadPhoto, deletePhoto, getIdentityPhotoUrl };
