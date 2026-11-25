// Scoped to recovery only; normal login and registration are unaffected.
function recoveryLimit(max = 10, windowMs = 15 * 60000) {
  const requests = new Map();
  return (req, res, next) => {
    const now = Date.now();
    for (const [key, entry] of requests) if (entry.until <= now) requests.delete(key);
    const key = req.ip || req.socket.remoteAddress;
    const entry = requests.get(key) || { count: 0, until: now + windowMs };
    if (entry.count >= max) {
      res.set('Retry-After', String(Math.ceil((entry.until - now) / 1000)));
      return res.status(429).json({ success: false, error: 'Too many requests. Please try again in a few minutes.' });
    }
    entry.count += 1;
    requests.set(key, entry);
    next();
  };
}
module.exports = recoveryLimit;
