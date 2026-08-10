/**
 * Global error handler — must be registered last in app.js
 */
const errorHandler = (err, req, res, next) => {
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: err.message || 'Server Error',
  });
};

module.exports = { errorHandler };
