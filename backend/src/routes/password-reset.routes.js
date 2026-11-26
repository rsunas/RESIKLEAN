const router = require('express').Router();
const { body } = require('express-validator');
const { forgotPassword, resetPassword } = require('../controllers/password-reset.controller');
const { validate } = require('../validators/auth.validator');
const recoveryLimit = require('../middlewares/password-reset-limit');

router.post('/forgot-password', recoveryLimit(),
  body('email').isString().bail().trim().isLength({ max: 254 }).isEmail(),
  body('codeFormat').optional().isIn(['six-digit']), validate, forgotPassword);
router.post('/reset-password', recoveryLimit(),
  body('token').isString().bail().trim().matches(/^(?:\d{6}|[a-f0-9]{64})$/),
  body('email').if((_value, { req }) => /^\d{6}$/.test(req.body.token))
    .isString().bail().trim().isLength({ max: 254 }).isEmail(),
  body('password').isString().bail().isLength({ min: 6 })
    .custom(value => value.trim().length >= 6 && Buffer.byteLength(value, 'utf8') <= 72),
  validate, resetPassword);

module.exports = router;
