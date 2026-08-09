/**
 * Send a standardised success response.
 */
const sendSuccess = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, data });

/**
 * Send a standardised error response.
 */
const sendError = (res, message, statusCode = 400) =>
  res.status(statusCode).json({ success: false, error: message });

module.exports = { sendSuccess, sendError };
