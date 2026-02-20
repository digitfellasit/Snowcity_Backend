const { pool } = require('../config/db');

async function createAddon({ title, description = null, price, discount_percent = 0, image_url = null, image_alt = null, active = true }) {
  const { rows } = await pool.query(
    `INSERT INTO addons (title, description, price, discount_percent, image_url, image_alt, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [title, description, price, discount_percent, image_url, image_alt, active]
  );
  return rows[0];
}

async function getAddonById(addon_id) {
  const { rows } = await pool.query(`SELECT * FROM addons WHERE addon_id = $1`, [addon_id]);
  return rows[0] || null;
}

async function listAddons({ active = null } = {}) {
  const where = [];
  const params = [];
  if (active != null) {
    where.push('active = $1');
    params.push(Boolean(active));
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM addons ${whereSql} ORDER BY created_at DESC`,
    params
  );
  return rows;
}

async function updateAddon(addon_id, fields = {}) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getAddonById(addon_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    sets.push(`${k} = $${idx + 1}`);
    params.push(v);
  });
  params.push(addon_id);

  const { rows } = await pool.query(
    `UPDATE addons SET ${sets.join(', ')}, updated_at = NOW()
     WHERE addon_id = $${params.length}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteAddon(addon_id) {
  const { rowCount } = await pool.query(`DELETE FROM addons WHERE addon_id = $1`, [addon_id]);
  return rowCount > 0;
}

module.exports = {
  createAddon,
  getAddonById,
  listAddons,
  updateAddon,
  deleteAddon,
};