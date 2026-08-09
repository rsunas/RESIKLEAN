const { body } = require('express-validator');

const truckLoadRules = [
  body('truckPlate').trim().notEmpty().withMessage('Truck plate is required'),
  body('length').isFloat({ gt: 0 }).withMessage('Length must be a positive number'),
  body('width').isFloat({ gt: 0 }).withMessage('Width must be a positive number'),
  body('height').isFloat({ gt: 0 }).withMessage('Height must be a positive number'),
];

module.exports = { truckLoadRules };
