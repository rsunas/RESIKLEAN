// Provider errors can contain credentials, authorization headers and reset email
// bodies. Log only known error codes and numeric statuses, never the raw error.
const safeCodes = new Set([
  'invalid_grant', 'invalid_client', 'unauthorized_client', 'invalid_scope',
  'invalid_request', 'access_denied', 'temporarily_unavailable', 'server_error',
  'invalidArgument', 'authError', 'forbidden', 'insufficientPermissions',
  'accessNotConfigured', 'dailyLimitExceeded', 'rateLimitExceeded',
  'userRateLimitExceeded', 'backendError', 'domainPolicy',
  'INVALID_ARGUMENT', 'UNAUTHENTICATED', 'PERMISSION_DENIED',
  'RESOURCE_EXHAUSTED', 'FAILED_PRECONDITION', 'INTERNAL', 'UNAVAILABLE',
  'SERVICE_DISABLED', 'ACCESS_TOKEN_SCOPE_INSUFFICIENT',
  'EAUTH', 'ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EENVELOPE', 'EMESSAGE',
  'ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET',
  'CERT_HAS_EXPIRED', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);

function emailDeliveryError(error) {
  const provider = process.env.MAIL_PROVIDER || 'smtp';
  const remote = error?.response?.data?.error;
  const candidates = [error?.code, typeof remote === 'string' ? remote : remote?.status];
  for (const items of [remote?.errors, remote?.details]) {
    if (Array.isArray(items)) {
      for (const item of items) candidates.push(item?.reason);
    }
  }
  const codes = [...new Set(candidates.filter(code => safeCodes.has(code)))];
  const result = {
    provider: ['smtp', 'gmail-api'].includes(provider) ? provider : 'unsupported',
    codes: codes.length ? codes : ['unclassified'],
  };
  const httpStatus = error?.response?.status;
  if (Number.isInteger(httpStatus) && httpStatus >= 100 && httpStatus <= 599) {
    result.httpStatus = httpStatus;
  }
  const smtpStatus = error?.responseCode;
  if (Number.isInteger(smtpStatus) && smtpStatus >= 200 && smtpStatus <= 599) {
    result.smtpStatus = smtpStatus;
  }
  return result;
}

module.exports = { emailDeliveryError };
