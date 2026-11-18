const express = require('express');
const multer = require('multer');
const controller = require('../controllers/announcement.controller');
const { protect } = require('../middlewares/auth');
const { authorize } = require('../middlewares/authorize');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1, fields: 16, fieldSize: 4096 }, fileFilter(req, file, callback) { callback(['image/jpeg', 'image/png'].includes(file.mimetype) ? null : new Error('Invalid image type'), true); } }).single('image');
const image = (req, res, next) => upload(req, res, error => {
  if (error) return res.status(400).json({ success: false, error: 'Use one JPEG or PNG image, 2 MB or smaller.' });
  if (req.file) {
    const b = req.file.buffer;
    const jpeg = b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    const png = b.length > 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (!jpeg && !png) return res.status(400).json({ success: false, error: 'The image must be a valid JPEG or PNG.' });
  }
  next();
});
const admin = express.Router();
admin.use(protect, authorize('admin'));
admin.get('/options', controller.options);
admin.get('/', controller.list);
admin.post('/', image, controller.save);
admin.get('/:id', controller.detail);
admin.patch('/:id', image, controller.save);
admin.delete('/:id', controller.remove);
const resident = express.Router();
resident.use(protect, authorize('resident'));
resident.get('/', controller.list);
module.exports = { admin, resident };
