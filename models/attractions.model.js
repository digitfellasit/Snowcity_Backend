const { pool } = require('../config/db');
const AttractionSlotAutoService = require('../services/attractionSlotAutoService');
const { toCdn } = require('../utils/media');

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
    meta_description = null,
    short_description = null,
    faq_items = [],
    head_schema = '',
    body_schema = '',
    footer_schema = '',
    time_slot_enabled = true,
    stop_booking = false,
    day_rule_type = 'all_days',
    custom_days = [],
    sort_order = 0,
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO attractions
     (title, slug, description, image_url, image_alt, desktop_image_url, desktop_image_alt, gallery, base_price, price_per_hour, discount_percent, active, badge, video_url, slot_capacity, meta_title, meta_description, short_description, faq_items, head_schema, body_schema, footer_schema, time_slot_enabled, stop_booking, day_rule_type, custom_days, sort_order)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::jsonb, $20, $21, $22, $23, $24, $25, $26::integer[], $27)
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
      meta_description,
      short_description,
      JSON.stringify(faq_items || []),
      head_schema || '',
      body_schema || '',
      footer_schema || '',
      time_slot_enabled,
      stop_booking,
      day_rule_type,
      custom_days || [],
      sort_order,
    ]
  );

  const attraction = rows[0];

  // Only create slots automatically for attractions with time slots enabled
  if (time_slot_enabled) {
    console.log('Backgrounding automatic slots for new attraction:', attraction.attraction_id);
    const defaultSlots = AttractionSlotAutoService.generateDefaultSlots(1); // 1-hour slots for attractions
    AttractionSlotAutoService.generateSlotsForAttraction(attraction.attraction_id, defaultSlots)
      .then(() => console.log('Slot generation completed in background for attraction:', attraction.attraction_id))
      .catch(err => console.error('Background slot generation failed for attraction:', attraction.attraction_id, err));
  } else {
    console.log('Skipping slot generation for attraction (time slots disabled):', attraction.attraction_id);
  }

  return attraction;
}

async function getAttractionById(attraction_id) {
  const { rows } = await pool.query(
    `SELECT a.*, 
            mi.url_path AS image_url_hydrated, 
            md.url_path AS desktop_image_url_hydrated
     FROM attractions a
     LEFT JOIN media_files mi ON mi.media_id = (CASE WHEN a.image_url ~ '^[0-9]+$' THEN a.image_url::bigint ELSE NULL END)
     LEFT JOIN media_files md ON md.media_id = (CASE WHEN a.desktop_image_url ~ '^[0-9]+$' THEN a.desktop_image_url::bigint ELSE NULL END)
     WHERE a.attraction_id = $1`, 
    [attraction_id]
  );
  if (!rows[0]) return null;
  const attr = rows[0];
  if (attr.image_url_hydrated) attr.image_url = attr.image_url_hydrated;
  if (attr.desktop_image_url_hydrated) attr.desktop_image_url = attr.desktop_image_url_hydrated;

  attr.image_url = toCdn(attr.image_url);
  attr.desktop_image_url = toCdn(attr.desktop_image_url);

  return attr;
}

async function getAttractionBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT a.*, 
            mi.url_path AS image_url_hydrated, 
            md.url_path AS desktop_image_url_hydrated
     FROM attractions a
     LEFT JOIN media_files mi ON mi.media_id = (CASE WHEN a.image_url ~ '^[0-9]+$' THEN a.image_url::bigint ELSE NULL END)
     LEFT JOIN media_files md ON md.media_id = (CASE WHEN a.desktop_image_url ~ '^[0-9]+$' THEN a.desktop_image_url::bigint ELSE NULL END)
     WHERE a.slug = $1`, 
    [slug]
  );
  if (!rows[0]) return null;
  const attr = rows[0];
  if (attr.image_url_hydrated) attr.image_url = attr.image_url_hydrated;
  if (attr.desktop_image_url_hydrated) attr.desktop_image_url = attr.desktop_image_url_hydrated;

  attr.image_url = toCdn(attr.image_url);
  attr.desktop_image_url = toCdn(attr.desktop_image_url);

  return attr;
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
    where.push(`a.active = $${i}`);
    params.push(Boolean(active));
    i += 1;
  }
  if (Array.isArray(attractionIds) && attractionIds.length) {
    where.push(`a.attraction_id = ANY($${i}::bigint[])`);
    params.push(attractionIds);
    i += 1;
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT a.attraction_id, a.title, a.slug, a.description, 
            COALESCE(mi.url_path, a.image_url) AS image_url, 
            a.image_alt, 
            COALESCE(md.url_path, a.desktop_image_url) AS desktop_image_url, 
            a.desktop_image_alt,
            a.base_price, a.sort_order, a.price_per_hour, a.discount_percent, a.active, a.badge, a.short_description,
            a.stop_booking, a.time_slot_enabled, a.day_rule_type, a.custom_days, a.created_at
     FROM attractions a
     LEFT JOIN media_files mi ON mi.media_id = (CASE WHEN a.image_url ~ '^[0-9]+$' THEN a.image_url::bigint ELSE NULL END)
     LEFT JOIN media_files md ON md.media_id = (CASE WHEN a.desktop_image_url ~ '^[0-9]+$' THEN a.desktop_image_url::bigint ELSE NULL END)
     ${whereSql}
     ORDER BY 
       a.sort_order ASC,
       CASE 
         WHEN a.title ILIKE '%Snow Park%' OR a.title ILIKE '%Snow City%' THEN 1 
         WHEN a.title ILIKE '%Mad Lab%' THEN 2 
         ELSE 3 
       END, 
       a.created_at ASC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );

  return rows.map(r => ({
    ...r,
    image_url: toCdn(r.image_url),
    desktop_image_url: toCdn(r.desktop_image_url)
  }));
}

async function updateAttraction(attraction_id, fields = {}) {
  if (fields.gallery) fields.gallery = JSON.stringify(fields.gallery);
  if (fields.faq_items) fields.faq_items = JSON.stringify(fields.faq_items);
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getAttractionById(attraction_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    let col;
    if (k === 'gallery' || k === 'faq_items') {
      col = `${k} = $${idx + 1}::jsonb`;
    } else if (k === 'custom_days') {
      col = `${k} = $${idx + 1}::integer[]`;
    } else {
      col = `${k} = $${idx + 1}`;
    }
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