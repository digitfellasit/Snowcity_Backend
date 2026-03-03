// admin/middleware/scopedAccess.js
const { pool } = require('../../config/db');

const MODULE_ALL_PREFIX = '__module_all__';

/**
 * Load admin_access scopes for a user and resolve module tokens.
 * Returns an object: { attraction: number[], combo: number[], banner: number[], page: number[], blog: number[], gallery: number[] }
 */
async function loadUserScopes(userId) {
  const { rows } = await pool.query(
    `SELECT resource_type, resource_id, module_permissions FROM admin_access WHERE user_id = $1`,
    [userId]
  );
  const scopes = {
    attraction: [],
    combo: [],
    banner: [],
    page: [],
    blog: [],
    gallery: [],
    announcement: [],
    module_permissions: [],
  };
  for (const row of rows) {
    const { resource_type, resource_id } = row;
    // Special row: resource_type='modules' stores module-level permissions
    if (resource_type === 'modules') {
      scopes.module_permissions = Array.isArray(row.module_permissions)
        ? row.module_permissions
        : [];
      continue;
    }
    // If resource_id is -1, treat it as full access to that type
    if (resource_id === null || resource_id === -1) {
      scopes[resource_type] = ['*']; // sentinel for full module
    } else if (typeof resource_id === 'string' && resource_id.startsWith(MODULE_ALL_PREFIX)) {
      scopes[resource_type] = ['*'];
    } else {
      scopes[resource_type] = scopes[resource_type] || [];
      if (!scopes[resource_type].includes('*')) {
        scopes[resource_type].push(Number(resource_id));
      }
    }
  }

  // Auto-include combos that contain scoped attractions (unless full combo access)
  if (!scopes.combo.includes('*') && scopes.attraction.length && !scopes.attraction.includes('*')) {
    try {
      const { rows: comboRows } = await pool.query(
        `SELECT DISTINCT combo_id FROM combos WHERE attraction_ids && $1::bigint[]`,
        [scopes.attraction]
      );
      const autoComboIds = comboRows.map(r => r.combo_id);
      scopes.combo = [...new Set([...scopes.combo, ...autoComboIds])];
    } catch { /* combos table might not have attraction_ids column */ }
  }

  return scopes;
}

/**
 * Middleware: attaches user scopes to req.user.scopes
 */
async function attachScopes(req, res, next) {
  if (!req.user?.id) return next();
  // If user has role admin, root, or superadmin, grant full access to all modules
  const userRoles = Array.isArray(req.user.roles) ? req.user.roles : [];
  if (userRoles.some(r => ['admin', 'root', 'superadmin', 'gm'].includes(r))) {
    req.user.scopes = {
      attraction: ['*'],
      combo: ['*'],
      banner: ['*'],
      page: ['*'],
      blog: ['*'],
      gallery: ['*'],
      announcement: ['*'],
    };
    return next();
  }
  try {
    req.user.scopes = await loadUserScopes(req.user.id);
  } catch (e) {
    // If loading fails, default to no scopes
    req.user.scopes = {
      attraction: [],
      combo: [],
      banner: [],
      page: [],
      blog: [],
      gallery: [],
      announcement: [],
    };
  }

  // Editors get full access to all catalog resource types (their role limits which
  // modules they can see in the sidebar/router, but data inside those modules is unscoped)
  if (userRoles.includes('editor')) {
    req.user.scopes.attraction = ['*'];
    req.user.scopes.combo = ['*'];
    req.user.scopes.banner = ['*'];
    req.user.scopes.page = ['*'];
    req.user.scopes.blog = ['*'];
    req.user.scopes.gallery = ['*'];
    req.user.scopes.announcement = ['*'];
  }

  next();
}

/**
 * Helper to build a WHERE clause fragment for a given resource type.
 * Returns { clause: string, params: any[] }
 */
function buildScopeFilter(type, scopes, alias = '') {
  const allowed = Array.isArray(scopes[type]) ? scopes[type] : [];
  const col = alias ? `${alias}.${type}_id` : `${type}_id`;
  if (allowed.includes('*')) {
    // Full module access: no filter needed
    return { clause: '', params: [] };
  }
  if (!allowed.length) {
    // No access: force false condition
    return { clause: `FALSE`, params: [] };
  }
  const placeholders = allowed.map((_, i) => `$${i + 1}`).join(',');
  return { clause: `${col} IN (${placeholders})`, params: allowed };
}

/**
 * Apply scoped filters to a query builder object (knex or pg client).
 * Pass query, resourceType, scopes, and optional table alias.
 */
function applyScopeFilter(query, resourceType, scopes, alias = '') {
  const { clause, params } = buildScopeFilter(resourceType, scopes, alias);
  if (clause) {
    if (typeof query.where === 'function') {
      // knex-style
      query.whereRaw(clause, params);
    } else {
      // raw pg client: you must append clause and params manually
      query.clause = clause;
      query.params = params;
    }
  }
  return query;
}

module.exports = {
  attachScopes,
  loadUserScopes,
  buildScopeFilter,
  applyScopeFilter,
  MODULE_ALL_PREFIX,
};
