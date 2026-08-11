const { body } = require('express-validator');

const missedReportRules = [
  body('description').optional().trim(),
  // photoUrl will be populated by the Cloudinary upload middleware — not validated here
];

module.exports = { missedReportRules };
