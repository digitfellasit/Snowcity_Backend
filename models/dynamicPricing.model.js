const { pool } = require('../config/db');

function mapDynamicPricingRule(row) {
  if (!row) return null;

  return {
    rule_id: row.rule_id,
    name: row.name,
    description: row.description,
    target_type: row.target_type,
    target_id: row.target_id,
    date_ranges: row.date_ranges || [],
    day_selection_mode: row.day_selection_mode || 'all_days',
    selected_weekdays: row.selected_weekdays || null,
    custom_dates: row.custom_dates || null,
    child_price_adjustments: row.child_price_adjustments || null,
    price_adjustment_type: row.price_adjustment_type,
    price_adjustment_value: Number(row.price_adjustment_value),
    active: Boolean(row.active),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createRule({
  name,
  description,
  target_type,
  target_id,
  date_ranges,
  day_selection_mode = 'all_days',
  selected_weekdays = null,
  custom_dates = null,
  child_price_adjustments = null,
  price_adjustment_type,
  price_adjustment_value,
  active = true,
}) {
  const { rows } = await pool.query(
    `INSERT INTO dynamic_pricing_rules
     (name, description, target_type, target_id, date_ranges, day_selection_mode, selected_weekdays, custom_dates, child_price_adjustments, price_adjustment_type, price_adjustment_value, active)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *`,
    [name, description, target_type, target_id, JSON.stringify(date_ranges), day_selection_mode, selected_weekdays || null, custom_dates || null, child_price_adjustments ? JSON.stringify(child_price_adjustments) : null, price_adjustment_type, price_adjustment_value, active]
  );
  return mapDynamicPricingRule(rows[0]);
}

async function getRules({ target_type, target_id, date, active = true } = {}) {
  const where = [];
  const params = [];
  let paramIndex = 1;

  if (target_type) {
    where.push(`target_type = $${paramIndex}`);
    params.push(target_type);
    paramIndex++;
  }

  if (target_id !== undefined) {
    where.push(`target_id = $${paramIndex}`);
    params.push(target_id);
    paramIndex++;
  }

  if (date) {
    // Check if any date range contains the given date
    where.push(`EXISTS (SELECT 1 FROM jsonb_array_elements(date_ranges) AS range WHERE (range->>'from')::date <= $${paramIndex}::date AND (range->>'to')::date >= $${paramIndex}::date)`);
    params.push(date);
    paramIndex++;
  }

  if (active !== undefined) {
    where.push(`active = $${paramIndex}`);
    params.push(active);
    paramIndex++;
  }

  const whereClause = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const { rows } = await pool.query(
    `SELECT * FROM dynamic_pricing_rules ${whereClause} ORDER BY created_at DESC`,
    params
  );

  return rows.map(mapDynamicPricingRule);
}

async function getRuleById(rule_id) {
  const { rows } = await pool.query(
    'SELECT * FROM dynamic_pricing_rules WHERE rule_id = $1',
    [rule_id]
  );
  return mapDynamicPricingRule(rows[0]);
}

async function updateRule(rule_id, updates) {
  const fields = [];
  const params = [];
  let paramIndex = 1;

  Object.keys(updates).forEach(key => {
    if (updates[key] !== undefined) {
      fields.push(`${key} = $${paramIndex}`);
      // Stringify JSON fields
      let value = updates[key];
      if (key === 'date_ranges' && Array.isArray(value)) value = JSON.stringify(value);
      if (key === 'child_price_adjustments' && value && typeof value === 'object') value = JSON.stringify(value);
      params.push(value);
      paramIndex++;
    }
  });

  if (fields.length === 0) return null;

  params.push(rule_id);

  const { rows } = await pool.query(
    `UPDATE dynamic_pricing_rules SET ${fields.join(', ')} WHERE rule_id = $${paramIndex} RETURNING *`,
    params
  );

  return mapDynamicPricingRule(rows[0]);
}

async function deleteRule(rule_id) {
  const { rows } = await pool.query(
    'DELETE FROM dynamic_pricing_rules WHERE rule_id = $1 RETURNING *',
    [rule_id]
  );
  return mapDynamicPricingRule(rows[0]);
}

/**
 * Check if a booking date matches the rule's day selection mode
 */
function matchesDaySelectionMode(rule, bookingDate) {
  const mode = rule.day_selection_mode || 'all_days';
  if (mode === 'all_days') return true;

  const date = new Date(bookingDate);
  const dayOfWeek = date.getUTCDay(); // 0=Sun, 6=Sat

  if (mode === 'weekends_only') {
    return dayOfWeek === 0 || dayOfWeek === 6;
  }

  if (mode === 'custom_weekdays') {
    const weekdays = rule.selected_weekdays || [];
    return weekdays.includes(dayOfWeek);
  }

  if (mode === 'specific_dates') {
    const customDates = (rule.custom_dates || []).map(d => {
      const dt = new Date(d);
      return dt.toISOString().split('T')[0];
    });
    const dateStr = date.toISOString().split('T')[0];
    return customDates.includes(dateStr);
  }

  return true;
}

async function getApplicableRules(targetType, targetId, bookingDate) {
  // Get rules that apply to this specific target
  const specificRules = await getRules({
    target_type: targetType,
    target_id: targetId,
    date: bookingDate,
    active: true,
  });

  // Get rules that apply to all targets of this type
  const allRules = await getRules({
    target_type: 'all',
    date: bookingDate,
    active: true,
  });

  // Filter by day selection mode
  const allCandidates = [...specificRules, ...allRules];
  return allCandidates.filter(rule => matchesDaySelectionMode(rule, bookingDate));
}

module.exports = {
  createRule,
  getRules,
  getRuleById,
  updateRule,
  deleteRule,
  getApplicableRules,
  mapDynamicPricingRule,
};