const router = require('express').Router();
const { body } = require('express-validator');
const { verifyEmail, resendVerification } = require('../controllers/email-verification.controller');
const { validate } = require('../validators/auth.validator');
const recoveryLimit = require('../middlewares/password-reset-limit');

router.post('/verify-email', recoveryLimit(10),
  body('token').isString().bail().trim().matches(/^(?:\d{6}|[a-f0-9]{64})$/),
  body('email').if((_value, { req }) => /^\d{6}$/.test(req.body.token))
    .isString().bail().trim().isLength({ max: 254 }).isEmail(), validate, verifyEmail);
router.post('/resend-verification', recoveryLimit(5),
  body('email').isString().bail().trim().isLength({ max: 254 }).isEmail(), validate, resendVerification);

module.exports = router;
