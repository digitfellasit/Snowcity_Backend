const { pool } = require('../config/db');
const ComboSlotAutoService = require('../services/comboSlotAutoService');
const { slugify } = require('../utils/slugify');

// Helper function to map combo data
function mapCombo(row) {
  if (!row) return null;

  return {
    combo_id: row.combo_id,
    name: row.name,
    slug: row.slug,
    attraction_ids: row.attraction_ids || [],
    attraction_prices: row.attraction_prices || {},
    total_price: Number(row.total_price) || 0,
    image_url: row.image_url,
    image_alt: row.image_alt,
    desktop_image_url: row.desktop_image_url,
    desktop_image_alt: row.desktop_image_alt,
    discount_percent: Number(row.discount_percent) || 0,
    active: Boolean(row.active),
    create_slots: Boolean(row.create_slots),
    meta_title: row.meta_title,
    short_description: row.short_description,
    description: row.description,
    faq_items: row.faq_items || [],
    head_schema: row.head_schema || '',
    body_schema: row.body_schema || '',
    footer_schema: row.footer_schema || '',
    stop_booking: Boolean(row.stop_booking),
    // Legacy fields for backward compatibility
    attraction_1_id: row.attraction_1_id,
    attraction_2_id: row.attraction_2_id,
    combo_price: Number(row.combo_price) || 0,
    created_at: row.created_at,
    updated_at: row.updated_at,
    // Attraction details if joined
    attractions: row.attractions || []
  };
}

async function createCombo({
  name,
  slug,
  attraction_ids,
  attraction_prices,
  total_price,
  image_url,
  image_alt = null,
  desktop_image_url = null,
  desktop_image_alt = null,
  discount_percent = 0,
  active = true,
  meta_title = null,
  short_description = null,
  description = null,
  faq_items = [],
  head_schema = '',
  body_schema = '',
  footer_schema = '',
  stop_booking = false
}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Generate slug if not provided
    const finalSlug = slug || slugify(name);

    // Insert combo
    const { rows } = await client.query(
      `INSERT INTO combos (name, slug, attraction_ids, attraction_prices, total_price, image_url, image_alt, desktop_image_url, desktop_image_alt, discount_percent, active, create_slots, meta_title, short_description, description, faq_items, head_schema, body_schema, footer_schema, stop_booking)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, true, $12, $13, $14, $15::jsonb, $16, $17, $18, $19)
       RETURNING *`,
      [name, finalSlug, attraction_ids, attraction_prices, total_price, image_url, image_alt, desktop_image_url, desktop_image_alt, discount_percent, active, meta_title, short_description, description, JSON.stringify(faq_items || []), head_schema || '', body_schema || '', footer_schema || '', stop_booking]
    );

    const combo = mapCombo(rows[0]);

    // Insert into junction table
    if (attraction_ids && attraction_ids.length > 0) {
      for (let i = 0; i < attraction_ids.length; i++) {
        const attractionId = attraction_ids[i];
        const price = attraction_prices[attractionId] || 0;
        const position = i + 1;
        await client.query(
          `INSERT INTO combo_attractions (combo_id, attraction_id, attraction_price, position_in_combo)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (combo_id, attraction_id) DO UPDATE SET attraction_price = $3, position_in_combo = $4`,
          [combo.combo_id, attractionId, price, position]
        );
      }
    }

    await client.query('COMMIT');

    // Always create slots automatically for new combos but in background
    // Query how many attractions have time slots enabled to set correct duration
    let timeSlotEnabledCount = attraction_ids?.length || 0;
    try {
      if (attraction_ids && attraction_ids.length > 0) {
        const tseRes = await client.query(
          `SELECT COUNT(*)::int AS cnt FROM attractions WHERE attraction_id = ANY($1) AND time_slot_enabled = true`,
          [attraction_ids]
        );
        timeSlotEnabledCount = tseRes.rows[0]?.cnt || 0;
      }
    } catch (_) { /* fallback to total count */ }
    console.log('Backgrounding automatic slots for new combo:', combo.combo_id, 'with', attraction_ids?.length, 'attractions,', timeSlotEnabledCount, 'time-slot-enabled');
    const defaultSlots = ComboSlotAutoService.generateDefaultSlots(attraction_ids.length, timeSlotEnabledCount);
    ComboSlotAutoService.generateSlotsForCombo(combo.combo_id, defaultSlots)
      .then(() => console.log('Slot generation completed in background for combo:', combo.combo_id))
      .catch(err => console.error('Background slot generation failed for combo:', combo.combo_id, err));

    return combo;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function getComboById(combo_id) {
  const { rows } = await pool.query(
    `SELECT cd.*
     FROM combo_details cd
     WHERE cd.combo_id = $1`,
    [combo_id]
  );
  return mapCombo(rows[0]);
}

async function getComboBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT cd.*
     FROM combo_details cd
     WHERE cd.slug = $1`,
    [slug]
  );
  return mapCombo(rows[0]);
}

async function listCombos({ active = null, comboIds = null } = {}) {
  const where = [];
  const params = [];
  if (active != null) {
    where.push('cd.active = $1');
    params.push(Boolean(active));
  }
  if (Array.isArray(comboIds) && comboIds.length) {
    where.push(`cd.combo_id = ANY($${params.length + 1}::bigint[])`);
    params.push(comboIds);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT cd.*
     FROM combo_details cd
     ${whereSql}
     ORDER BY 
       CASE 
         WHEN cd.name ILIKE '%Snow Park%' OR cd.name ILIKE '%Snow City%' THEN 1 
         WHEN cd.name ILIKE '%Mad Lab%' THEN 2 
         ELSE 3 
       END, 
       cd.created_at ASC`,
    params
  );
  return rows.map(mapCombo);
}

async function updateCombo(combo_id, fields = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Update main combo table
    const entries = Object.entries(fields).filter(([k, v]) => v !== undefined && !['attraction_ids', 'attraction_prices'].includes(k));

    if (entries.length > 0) {
      const sets = [];
      const params = [];
      entries.forEach(([k, v], idx) => {
        if (k === 'faq_items') {
          sets.push(`${k} = $${idx + 1}::jsonb`);
          params.push(JSON.stringify(v || []));
        } else {
          sets.push(`${k} = $${idx + 1}`);
          params.push(v);
        }
      });
      params.push(combo_id);

      await client.query(
        `UPDATE combos SET ${sets.join(', ')}, updated_at = NOW()
         WHERE combo_id = $${params.length}`,
        params
      );
    }

    // Update attraction relationships if provided
    if (fields.attraction_ids && fields.attraction_prices) {
      // Delete existing relationships
      await client.query('DELETE FROM combo_attractions WHERE combo_id = $1', [combo_id]);

      // Insert new relationships
      for (const attractionId of fields.attraction_ids) {
        const price = fields.attraction_prices[attractionId] || 0;
        const position = fields.attraction_ids.indexOf(attractionId) + 1;
        await client.query(
          `INSERT INTO combo_attractions (combo_id, attraction_id, attraction_price, position_in_combo)
           VALUES ($1, $2, $3, $4)`,
          [combo_id, attractionId, price, position]
        );
      }

      // Update the main table with new arrays
      await client.query(
        `UPDATE combos SET attraction_ids = $1, attraction_prices = $2, updated_at = NOW()
         WHERE combo_id = $3`,
        [fields.attraction_ids, fields.attraction_prices, combo_id]
      );
    }

    await client.query('COMMIT');
    return await getComboById(combo_id);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function deleteCombo(combo_id) {
  const { rowCount } = await pool.query(`DELETE FROM combos WHERE combo_id = $1`, [combo_id]);
  return rowCount > 0;
}

module.exports = {
  createCombo,
  getComboById,
  getComboBySlug,
  listCombos,
  updateCombo,
  deleteCombo,
  mapCombo,
};