const { pool } = require('../config/db');
const logger = require('../config/logger');

function mapBanner(row) {
  if (!row) return null;
  return {
    banner_id: row.banner_id,
    web_image: row.web_image,
    web_image_alt: row.web_image_alt,
    mobile_image: row.mobile_image,
    mobile_image_alt: row.mobile_image_alt,
    title: row.title,
    description: row.description,
    cta_text: row.cta_text,
    link_url: row.link_url,
    linked_attraction_id: row.linked_attraction_id,
    linked_offer_id: row.linked_offer_id,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createBanner({
  web_image = null,
  web_image_alt = null,
  mobile_image = null,
  mobile_image_alt = null,
  title = null,
  description = null,
  cta_text = null,
  link_url = null,
  linked_attraction_id = null,
  linked_offer_id = null,
  active = true,
}) {
  const { rows } = await pool.query(
    `INSERT INTO banners (web_image, web_image_alt, mobile_image, mobile_image_alt, title, description, cta_text, link_url, linked_attraction_id, linked_offer_id, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *`,
    [web_image, web_image_alt, mobile_image, mobile_image_alt, title, description, cta_text, link_url, linked_attraction_id, linked_offer_id, active]
  );
  return mapBanner(rows[0]);
}

async function getBannerById(banner_id) {
  const { rows } = await pool.query(`SELECT * FROM banners WHERE banner_id = $1`, [banner_id]);
  return mapBanner(rows[0]);
}

async function listBanners({ active = null, attraction_id = null, offer_id = null, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (active !== null && active !== undefined) {
    where.push(`b.active = $${paramIndex++}`);
    params.push(Boolean(active));
  }
  if (attraction_id != null) {
    where.push(`b.linked_attraction_id = $${paramIndex++}`);
    params.push(Number(attraction_id));
  }
  if (offer_id != null) {
    where.push(`b.linked_offer_id = $${paramIndex++}`);
    params.push(Number(offer_id));
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Add limit and offset with correct parameter indices
  params.push(Number(limit));
  params.push(Number(offset));

  const limitParam = paramIndex;
  const offsetParam = paramIndex + 1;

  const query = `SELECT b.banner_id, b.web_image, b.web_image_alt, b.mobile_image, b.mobile_image_alt,
                        b.title, b.description, b.cta_text, b.link_url, b.linked_attraction_id, b.linked_offer_id,
                        b.active, b.created_at, b.updated_at
     FROM banners b
     ${whereSql}
     ORDER BY b.created_at DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`;

  try {
    logger.debug('Executing listBanners query', { query, params, paramIndex, limitParam, offsetParam });
    const { rows } = await pool.query(query, params);
    logger.debug('listBanners query result', { rowCount: rows.length });
    const mapped = rows.map(mapBanner).filter(Boolean);
    return mapped;
  } catch (error) {
    logger.error('Error in listBanners query', {
      error: error.message,
      query,
      params,
      paramIndex,
      limitParam,
      offsetParam,
      stack: error.stack,
    });
    throw error;
  }
}

async function updateBanner(banner_id, fields = {}) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getBannerById(banner_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    sets.push(`${k} = $${idx + 1}`);
    params.push(v);
  });
  params.push(banner_id);

  const { rows } = await pool.query(
    `UPDATE banners SET ${sets.join(', ')}, updated_at = NOW()
     WHERE banner_id = $${params.length}
     RETURNING *`,
    params
  );
  return mapBanner(rows[0]);
}

async function deleteBanner(banner_id) {
  const { rowCount } = await pool.query(`DELETE FROM banners WHERE banner_id = $1`, [banner_id]);
  return rowCount > 0;
}

module.exports = {
  createBanner,
  getBannerById,
  listBanners,
  updateBanner,
  deleteBanner,
};
