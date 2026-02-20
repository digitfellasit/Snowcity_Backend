const { pool } = require('../config/db');
const AttractionSlotAutoService = require('../services/attractionSlotAutoService');

async function createAttraction(payload) {
  const {
    title,
    slug = null,
    description = null,
    image_url = null,
    image_alt = null,
    desktop_image_url = null,
    desktop_image_alt = null,
    gallery = [],
    base_price = 0,
    price_per_hour = 0,
    discount_percent = 0,
    active = true,
    badge = null,
    video_url = null,
    slot_capacity = 0,
    meta_title = null,
    short_description = null,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO attractions
     (title, slug, description, image_url, image_alt, desktop_image_url, desktop_image_alt, gallery, base_price, price_per_hour, discount_percent, active, badge, video_url, slot_capacity, meta_title, short_description)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17)
     RETURNING *`,
    [
      title,
      slug,
      description,
      image_url,
      image_alt,
      desktop_image_url,
      desktop_image_alt,
      JSON.stringify(gallery || []),
      base_price,
      price_per_hour,
      discount_percent,
      active,
      badge,
      video_url,
      slot_capacity,
      meta_title,
      short_description,
    ]
  );

  const attraction = rows[0];

  // Always create slots automatically for new attractions
  console.log('Creating automatic slots for new attraction:', attraction.attraction_id);
  const defaultSlots = AttractionSlotAutoService.generateDefaultSlots(1); // 1-hour slots for attractions
  console.log('Generated default slots count:', defaultSlots.length);
  await AttractionSlotAutoService.generateSlotsForAttraction(attraction.attraction_id, defaultSlots);
  console.log('Slot generation completed for attraction:', attraction.attraction_id);

  return attraction;
}

async function getAttractionById(attraction_id) {
  const { rows } = await pool.query(`SELECT * FROM attractions WHERE attraction_id = $1`, [attraction_id]);
  return rows[0] || null;
}

async function getAttractionBySlug(slug) {
  const { rows } = await pool.query(`SELECT * FROM attractions WHERE slug = $1`, [slug]);
  return rows[0] || null;
}

async function listAttractions({ search = '', active = null, limit = 50, offset = 0, attractionIds = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (search) {
    where.push(`(title ILIKE $${i} OR description ILIKE $${i} OR short_description ILIKE $${i})`);
    params.push(`%${search}%`);
    i += 1;
  }
  if (active != null) {
    where.push(`active = $${i}`);
    params.push(Boolean(active));
    i += 1;
  }
  if (Array.isArray(attractionIds) && attractionIds.length) {
    where.push(`attraction_id = ANY($${i}::bigint[])`);
    params.push(attractionIds);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT * FROM attractions
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return rows;
}

async function updateAttraction(attraction_id, fields = {}) {
  if (fields.gallery) fields.gallery = JSON.stringify(fields.gallery);
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getAttractionById(attraction_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    const col = k === 'gallery' ? `${k} = $${idx + 1}::jsonb` : `${k} = $${idx + 1}`;
    sets.push(col);
    params.push(v);
  });
  params.push(attraction_id);

  const { rows } = await pool.query(
    `UPDATE attractions SET ${sets.join(', ')}, updated_at = NOW()
     WHERE attraction_id = $${params.length}
     RETURNING *`,
    params
  );
  return rows[0] || null;
}

async function deleteAttraction(attraction_id) {
  const { rowCount } = await pool.query(`DELETE FROM attractions WHERE attraction_id = $1`, [attraction_id]);
  return rowCount > 0;
}

async function setActive(attraction_id, active) {
  const { rows } = await pool.query(
    `UPDATE attractions SET active = $1, updated_at = NOW() WHERE attraction_id = $2 RETURNING *`,
    [Boolean(active), attraction_id]
  );
  return rows[0] || null;
}

module.exports = {
  createAttraction,
  getAttractionById,
  getAttractionBySlug,
  listAttractions,
  updateAttraction,
  deleteAttraction,
  setActive,
};