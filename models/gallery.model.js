const { pool } = require('../config/db');
const { toCdn } = require('../utils/media');

const TARGET_TYPES = new Set(['none', 'attraction', 'combo']);

function normalizeTargetType(value) {
  const str = (value || 'none').toString().toLowerCase();
  return TARGET_TYPES.has(str) ? str : 'none';
}

function normalizeTargetRef(targetType, ref) {
  if (targetType === 'none') return null;
  if (ref === null || ref === undefined || ref === '') return null;
  const num = Number(ref);
  return Number.isFinite(num) ? num : null;
}

function map(row) {
  if (!row) return null;
  return {
    gallery_item_id: row.gallery_item_id,
    media_type: row.media_type,
    url: toCdn(row.url),
    image_alt: row.image_alt,
    title: row.title,
    description: row.description,
    target_type: row.target_type || 'none',
    target_ref_id: row.target_ref_id,
    target_name: row.target_name || null,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function create({ media_type, url, image_alt = null, title = null, description = null, target_type = 'none', target_ref_id = null, active = true }) {
  const normalizedType = normalizeTargetType(target_type);
  const normalizedRef = normalizeTargetRef(normalizedType, target_ref_id);
  const { rows } = await pool.query(
    `INSERT INTO gallery_items (media_type, url, image_alt, title, description, target_type, target_ref_id, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [media_type, url, image_alt, title, description, normalizedType, normalizedRef, active]
  );
  return map(rows[0]);
}

async function getById(id) {
  const { rows } = await pool.query(
    `SELECT gi.gallery_item_id, gi.media_type, 
            COALESCE(mg.url_path, gi.url) AS url,
            gi.image_alt, gi.title, gi.description, gi.target_type, gi.target_ref_id,
            gi.active, gi.created_at, gi.updated_at,
            COALESCE(a.title, c.name) AS target_name
     FROM gallery_items gi
     LEFT JOIN media_files mg ON mg.media_id = (CASE WHEN gi.url ~ '^[0-9]+$' THEN gi.url::bigint ELSE NULL END)
     LEFT JOIN attractions a ON gi.target_type = 'attraction' AND a.attraction_id = gi.target_ref_id
     LEFT JOIN combos c ON gi.target_type = 'combo' AND c.combo_id = gi.target_ref_id
     WHERE gi.gallery_item_id = $1`,
    [id]
  );
  return map(rows[0]);
}

async function list({ active = null, q = '', target_type = null, target_ref_id = null, limit = 50, offset = 0, galleryIds = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;
  if (active != null) {
    where.push(`gi.active = $${i++}`);
    params.push(Boolean(active));
  }
  if (q) {
    where.push(`(gi.title ILIKE $${i} OR gi.description ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  const normalizedFilterType = target_type && target_type !== 'any'
    ? normalizeTargetType(target_type)
    : null;
  if (normalizedFilterType) {
    where.push(`gi.target_type = $${i++}`);
    params.push(normalizedFilterType);
  }
  if (target_ref_id != null && target_ref_id !== '') {
    const ref = Number(target_ref_id);
    if (!Number.isFinite(ref)) {
      throw new Error('Invalid target_ref_id filter');
    }
    where.push(`gi.target_ref_id = $${i++}`);
    params.push(ref);
  }
  if (Array.isArray(galleryIds) && galleryIds.length) {
    where.push(`gi.gallery_item_id = ANY($${i}::bigint[])`);
    params.push(galleryIds);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT gi.gallery_item_id, gi.media_type, 
            COALESCE(mg.url_path, gi.url) AS url,
            gi.image_alt, gi.title, gi.description, gi.target_type, gi.target_ref_id,
            gi.active, gi.created_at, gi.updated_at,
            COALESCE(a.title, c.name) AS target_name
     FROM gallery_items gi
     LEFT JOIN media_files mg ON mg.media_id = (CASE WHEN gi.url ~ '^[0-9]+$' THEN gi.url::bigint ELSE NULL END)
     LEFT JOIN attractions a ON gi.target_type = 'attraction' AND a.attraction_id = gi.target_ref_id
     LEFT JOIN combos c ON gi.target_type = 'combo' AND c.combo_id = gi.target_ref_id
     ${whereSql.replace(/gallery_items/g, 'gi')}
     ORDER BY gi.created_at ASC LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return rows.map(map);
}

async function update(id, fields = {}) {
  const input = { ...fields };
  const hasTargetType = Object.prototype.hasOwnProperty.call(input, 'target_type');
  const hasTargetRef = Object.prototype.hasOwnProperty.call(input, 'target_ref_id');
  if (hasTargetType || hasTargetRef) {
    const normalizedType = hasTargetType ? normalizeTargetType(input.target_type) : undefined;
    const normalizedRef = normalizeTargetRef(normalizedType || (fields.target_type ? normalizeTargetType(fields.target_type) : 'none'), input.target_ref_id);
    if (hasTargetType) input.target_type = normalizedType;
    if (hasTargetRef || normalizedType === 'none') input.target_ref_id = normalizedRef;
  }
  const entries = Object.entries(input).filter(([, v]) => v !== undefined);
  if (!entries.length) return getById(id);
  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    sets.push(`${k} = $${idx + 1}`);
    params.push(v);
  });
  params.push(id);
  const { rows } = await pool.query(
    `UPDATE gallery_items SET ${sets.join(', ')}, updated_at = NOW() WHERE gallery_item_id = $${params.length} RETURNING *`,
    params
  );
  return map(rows[0]);
}

async function remove(id) {
  const { rowCount } = await pool.query(`DELETE FROM gallery_items WHERE gallery_item_id = $1`, [id]);
  return rowCount > 0;
}

async function bulkDelete(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return { deletedCount: 0 };
  }

  const { rowCount } = await pool.query(
    `DELETE FROM gallery_items WHERE gallery_item_id = ANY($1::bigint[])`,
    [ids]
  );
  return { deletedCount: rowCount };
}

module.exports = { create, getById, list, update, remove, bulkDelete };
