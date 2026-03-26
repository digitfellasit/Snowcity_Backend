const { pool } = require('../config/db');
const logger = require('../config/logger');
const { toCdn } = require('../utils/media');

function mapPromoCard(row) {
  if (!row) return null;
  return {
    id: row.id,
    image_url: toCdn(row.image_url_hydrated || row.image_url),
    link_url: row.link_url,
    active: row.active,
    sort_order: row.sort_order || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createPromoCard({ image_url, link_url, active = true, sort_order = 0 }) {
  const { rows } = await pool.query(
    `INSERT INTO promo_cards (image_url, link_url, active, sort_order)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [image_url, link_url, active, sort_order]
  );
  return mapPromoCard(rows[0]);
}

async function getPromoCardById(id) {
  const { rows } = await pool.query(
    `SELECT pc.*, mi.url_path AS image_url_hydrated
     FROM promo_cards pc
     LEFT JOIN media_files mi ON mi.media_id = (CASE WHEN pc.image_url ~ '^[0-9]+$' THEN pc.image_url::bigint ELSE NULL END)
     WHERE pc.id = $1`, 
    [id]
  );
  return mapPromoCard(rows[0]);
}

async function listPromoCards({ active = null, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (active !== null && active !== undefined) {
    where.push(`active = $${paramIndex++}`);
    params.push(Boolean(active));
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  params.push(Number(limit));
  params.push(Number(offset));
  
  const limitParam = paramIndex;
  const offsetParam = paramIndex + 1;

  const query = `SELECT pc.*, mi.url_path AS image_url_hydrated 
                 FROM promo_cards pc
                 LEFT JOIN media_files mi ON mi.media_id = (CASE WHEN pc.image_url ~ '^[0-9]+$' THEN pc.image_url::bigint ELSE NULL END)
                 ${whereSql.replace(/active/g, 'pc.active')} 
                 ORDER BY pc.sort_order ASC, pc.created_at DESC 
                 LIMIT $${limitParam} OFFSET $${offsetParam}`;
  
  const { rows } = await pool.query(query, params);
  return rows.map(mapPromoCard);
}

async function updatePromoCard(id, fields = {}) {
  const entries = Object.entries(fields).filter(([k, v]) => v !== undefined && ['image_url', 'link_url', 'active', 'sort_order'].includes(k));
  if (!entries.length) return getPromoCardById(id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    sets.push(`${k} = $${idx + 1}`);
    params.push(v);
  });
  params.push(id);

  const { rows } = await pool.query(
    `UPDATE promo_cards SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`,
    params
  );
  return mapPromoCard(rows[0]);
}

async function deletePromoCard(id) {
  const { rowCount } = await pool.query(`DELETE FROM promo_cards WHERE id = $1`, [id]);
  return rowCount > 0;
}

module.exports = {
  createPromoCard,
  getPromoCardById,
  listPromoCards,
  updatePromoCard,
  deletePromoCard,
};
