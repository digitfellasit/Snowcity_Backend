const { ensureRoles } = require('./authMiddleware');

function normalizeRoles(roles) {
  return roles.map((r) => String(r).toLowerCase());
}

function requireAnyRole(...roles) {
  const needed = normalizeRoles(roles);
  return async (req, res, next) => {
    try {
      const userRoles = normalizeRoles(await ensureRoles(req));
      if (userRoles.includes('superadmin') || userRoles.includes('root')) return next();
      const ok = needed.some((r) => userRoles.includes(r));
      if (!ok) {
        return res.status(403).json({ error: 'Forbidden: Insufficient role', anyOf: needed });
      }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

function requireRoles(...roles) {
  const all = normalizeRoles(roles);
  return async (req, res, next) => {
    try {
      const userRoles = normalizeRoles(await ensureRoles(req));
      if (userRoles.includes('superadmin') || userRoles.includes('root')) return next();
      const missing = all.filter((r) => !userRoles.includes(r));
      if (missing.length) {
        return res.status(403).json({ error: 'Forbidden: Missing required roles', missing });
      }
      return next();
    } catch (err) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  };
}

module.exports = {
  requireAnyRole,
  requireRoles,
};