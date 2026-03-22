const { pool } = require('../config/db');
const attractionSlotsModel = require('./attractionSlots.model');
const comboSlotsModel = require('./comboSlots.model');
const attractionService = require('../services/attractionService');
const comboService = require('../services/comboService');

function mapOffer(row) {
  if (!row) return null;
  return {
    offer_id: row.offer_id,
    title: row.title,
    description: row.description,
    image_url: row.image_url,
    image_alt: row.image_alt,
    rule_type: row.rule_type,
    discount_type: row.discount_type || 'percent',
    discount_value: Number(row.discount_value ?? 0),
    max_discount: row.max_discount != null ? Number(row.max_discount) : null,
    valid_from: row.valid_from,
    valid_to: row.valid_to,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    rule_count: row.rule_count != null ? Number(row.rule_count) : undefined,
    // Buy X Get Y details
    buy_qty: row.buy_qty,
    get_qty: row.get_qty,
    get_target_type: row.get_target_type,
    get_target_id: row.get_target_id,
    get_discount_type: row.get_discount_type,
    get_discount_value: row.get_discount_value,
  };
}

function mapRule(row) {
  if (!row) return null;
  return {
    rule_id: row.rule_id,
    offer_id: row.offer_id,
    target_type: row.target_type,
    target_id: row.target_id,
    applies_to_all: !!row.applies_to_all,
    date_from: row.date_from,
    date_to: row.date_to,
    time_from: row.time_from,
    time_to: row.time_to,
    slot_type: row.slot_type,
    slot_id: row.slot_id,
    rule_discount_type: row.rule_discount_type,
    rule_discount_value: row.rule_discount_value != null ? Number(row.rule_discount_value) : null,
    priority: 0,
    day_type: row.day_type,
    specific_days: row.specific_days,
    is_holiday: !!row.is_holiday,
    specific_date: row.specific_date,
    specific_time: row.specific_time,
    combo_child_adjustments: row.combo_child_adjustments,
    buy_qty: row.buy_qty,
    get_qty: row.get_qty,
    get_target_type: row.get_target_type,
    get_target_id: row.get_target_id,
    get_discount_type: row.get_discount_type,
    get_discount_value: row.get_discount_value != null ? Number(row.get_discount_value) : null,
    ticket_limit: row.ticket_limit != null ? Number(row.ticket_limit) : null,
    offer_price: row.offer_price != null ? Number(row.offer_price) : null,
    attraction_slug: row.attraction_slug,
    combo_slug: row.combo_slug,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listOfferRules(offer_id) {
  const { rows } = await pool.query(
    `SELECT r.*, a.slug as attraction_slug, c.slug as combo_slug 
     FROM offer_rules r
     LEFT JOIN attractions a ON r.target_type = 'attraction' AND r.target_id = a.attraction_id
     LEFT JOIN combos c ON r.target_type = 'combo' AND r.target_id = c.combo_id
     WHERE r.offer_id = $1 
     ORDER BY r.rule_id ASC`,
    [offer_id]
  );
  return rows.map(mapRule);
}

async function replaceOfferRules(offer_id, rules = []) {
  await pool.query(`DELETE FROM offer_rules WHERE offer_id = $1`, [offer_id]);
  if (!Array.isArray(rules) || !rules.length) return [];

  const cols = [
    'offer_id',
    'target_type',
    'target_id',
    'applies_to_all',
    'date_from',
    'date_to',
    'time_from',
    'time_to',
    'slot_type',
    'slot_id',
    'rule_discount_type',
    'rule_discount_value',
    'priority',
    'day_type',
    'specific_days',
    'is_holiday',
    'specific_date',
    'specific_time',
    'combo_child_adjustments',
    'buy_qty',
    'get_qty',
    'get_target_type',
    'get_target_id',
    'get_discount_type',
    'get_discount_value',
    'ticket_limit',
    'offer_price'
  ];

  const values = [];
  const params = [];
  let idx = 1;
  rules.forEach((rule) => {
    const targetType = rule?.target_type || rule?.targetType || 'attraction';
    const slotType = rule?.slot_type || rule?.slotType || null;
    values.push(`(${cols.map(() => `$${idx++}`).join(', ')})`);
    params.push(
      offer_id,
      targetType,
      rule?.target_id ?? rule?.targetId ?? null,
      !!rule?.applies_to_all,
      (rule?.date_from ?? rule?.dateFrom ?? null) || null,
      (rule?.date_to ?? rule?.dateTo ?? null) || null,
      (rule?.time_from ?? rule?.timeFrom ?? null) || null,
      (rule?.time_to ?? rule?.timeTo ?? null) || null,
      slotType,
      rule?.slot_id ?? rule?.slotId ?? null,
      rule?.rule_discount_type ?? rule?.ruleDiscountType ?? null,
      rule?.rule_discount_value ?? rule?.ruleDiscountValue ?? null,
      0, // Priority always 0 (unused)
      (rule?.day_type ?? rule?.dayType ?? null) || null,
      rule?.specific_days ?? rule?.specificDays ?? null,
      !!rule?.is_holiday,
      (rule?.specific_date ?? rule?.specificDate ?? null) || null,
      (rule?.specific_time ?? rule?.specificTime ?? null) || null,
      rule?.combo_child_adjustments ? JSON.stringify(rule.combo_child_adjustments) : null,
      rule?.buy_qty != null ? Number(rule.buy_qty) : null,
      rule?.get_qty != null ? Number(rule.get_qty) : null,
      (rule?.get_target_type ?? rule?.getTargetType ?? null) || null,
      rule?.get_target_id ?? rule?.getTargetId ?? null,
      (rule?.get_discount_type ?? rule?.getDiscountType ?? null) || null,
      rule?.get_discount_value != null ? Number(rule.get_discount_value) : null,
      rule?.ticket_limit != null ? Number(rule.ticket_limit) : null,
      rule?.offer_price != null ? Number(rule.offer_price) : null
    );
  });

  const { rows } = await pool.query(
    `INSERT INTO offer_rules (${cols.join(', ')}) VALUES ${values.join(', ')} RETURNING *`,
    params
  );
  return rows.map(mapRule);
}

async function createOffer(payload = {}) {
  const {
    title,
    description = null,
    image_url = null,
    image_alt = null,
    rule_type = null,
    discount_type = 'percent',
    discount_value = 0,
    max_discount = null,
    valid_from = null,
    valid_to = null,
    active = true,
    rules = [],
  } = payload;

  const { rows } = await pool.query(
    `INSERT INTO offers (
        title,
        description,
        image_url,
        image_alt,
        rule_type,
        discount_type,
        discount_value,
        max_discount,
        valid_from,
        valid_to,
        active
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::date, $10::date, $11)
      RETURNING *`,
    [
      title,
      description,
      image_url,
      image_alt,
      rule_type,
      discount_type,
      discount_value,
      max_discount,
      valid_from,
      valid_to,
      active,
    ]
  );

  const offer = mapOffer(rows[0]);
  const storedRules = await replaceOfferRules(offer.offer_id, rules);
  return { ...offer, rules: storedRules };
}

async function getOfferById(offer_id) {
  const { rows } = await pool.query(`
    SELECT o.*, 
      -- Buy X Get Y details
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.buy_qty ELSE NULL END AS buy_qty,
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_qty ELSE NULL END AS get_qty,
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_target_type ELSE NULL END AS get_target_type,
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_target_id ELSE NULL END AS get_target_id,
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_discount_type ELSE NULL END AS get_discount_type,
      CASE WHEN o.rule_type = 'buy_x_get_y' THEN orr.get_discount_value ELSE NULL END AS get_discount_value
    FROM offers o
    LEFT JOIN offer_rules orr ON orr.offer_id = o.offer_id AND orr.rule_id = (
      SELECT MIN(rule_id) FROM offer_rules WHERE offer_id = o.offer_id
    )
    WHERE o.offer_id = $1
  `, [offer_id]);
  const offer = mapOffer(rows[0]);
  if (!offer) return null;
  const rules = await listOfferRules(offer.offer_id);
  return { ...offer, rules };
}

async function listOffers({ active = null, rule_type = null, date = null, q = '', limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (active != null) {
    where.push(`o.active = $${i++}`);
    params.push(Boolean(active));
  }
  if (rule_type) {
    where.push(`o.rule_type = $${i++}`);
    params.push(rule_type);
  }
  if (date) {
    where.push(`(o.valid_from IS NULL OR o.valid_from <= $${i}::date) AND (o.valid_to IS NULL OR o.valid_to >= $${i}::date)`);
    params.push(date);
    i += 1;
  }
  if (q) {
    where.push(`(o.title ILIKE $${i} OR o.description ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT o.offer_id, o.title, o.description, o.image_url, o.image_alt,
            o.rule_type, o.discount_type, o.discount_value, o.max_discount,
            o.valid_from, o.valid_to, o.active, o.created_at, o.updated_at,
            COALESCE(rc.cnt, 0) AS rule_count,
            -- Buy X Get Y details from first rule
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.buy_qty ELSE NULL END AS buy_qty,
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.get_qty ELSE NULL END AS get_qty,
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.get_target_type ELSE NULL END AS get_target_type,
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.get_target_id ELSE NULL END AS get_target_id,
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.get_discount_type ELSE NULL END AS get_discount_type,
            CASE WHEN o.rule_type = 'buy_x_get_y' THEN fr.get_discount_value ELSE NULL END AS get_discount_value
     FROM offers o
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS cnt FROM offer_rules WHERE offer_id = o.offer_id
     ) rc ON true
     LEFT JOIN LATERAL (
       SELECT * FROM offer_rules WHERE offer_id = o.offer_id ORDER BY rule_id ASC LIMIT 1
     ) fr ON true
     ${whereSql}
     ORDER BY o.created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );

  const offers = rows.map(mapOffer);

  if (offers.length > 0) {
    const offerIds = offers.map(o => o.offer_id);
    const rulesRows = await pool.query(
      `SELECT r.*, a.slug as attraction_slug, c.slug as combo_slug 
       FROM offer_rules r
       LEFT JOIN attractions a ON r.target_type = 'attraction' AND r.target_id = a.attraction_id
       LEFT JOIN combos c ON r.target_type = 'combo' AND r.target_id = c.combo_id
       WHERE r.offer_id = ANY($1::int[]) 
       ORDER BY r.rule_id ASC`,
      [offerIds]
    );
    const mappedRules = rulesRows.rows.map(mapRule);
    offers.forEach(o => {
      o.rules = mappedRules.filter(r => String(r.offer_id) === String(o.offer_id));
    });
  }

  return offers;
}

async function updateOffer(offer_id, payload = {}) {
  const { rules = [], ...fields } = payload || {};
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getOfferById(offer_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    const cast = ['valid_from', 'valid_to'].includes(k) ? '::date' : '';
    sets.push(`${k} = $${idx + 1}${cast}`);
    params.push(v);
  });
  params.push(offer_id);

  const { rows } = await pool.query(
    `UPDATE offers SET ${sets.join(', ')}, updated_at = NOW()
     WHERE offer_id = $${params.length}
     RETURNING *`,
    params
  );
  const offer = mapOffer(rows[0]);
  const storedRules = await replaceOfferRules(offer.offer_id, rules);
  return { ...offer, rules: storedRules };
}

async function deleteOffer(offer_id) {
  const { rowCount } = await pool.query(`DELETE FROM offers WHERE offer_id = $1`, [offer_id]);
  return rowCount > 0;
}

async function findApplicableOfferRule({
  targetType,
  targetId = null,
  slotType = null,
  slotId = null,
  date = null,
  time = null,
}) {
  if (!targetType) return null;
  const matchDate = date || new Date().toISOString().slice(0, 10);
  const matchTime = time || null;

  // ── Same-day blocking is handled in the SQL query below ──
  const todayStr = new Date().toISOString().slice(0, 10);
  // ───────────────────────────────────────────────────────────────────

  // ── Dynamic Pricing Override ──────────────────────────────────────
  // If dynamic pricing rules exist for this target + date, DO NOT apply
  // any offers (wednesday, happy_hour, etc.). Only the dynamic price is used.
  if (targetId != null) {
    try {
      const dynamicPricingModel = require('./dynamicPricing.model');
      const dpRules = await dynamicPricingModel.getApplicableRules(
        targetType,
        Number(targetId),
        matchDate,
      );
      if (Array.isArray(dpRules) && dpRules.length > 0) {
        return null; // Dynamic pricing overrides all offers for this date
      }
    } catch (_) {
      // dynamicPricing model might not exist — silently continue
    }
  }
  // ─────────────────────────────────────────────────────────────────

  const params = [
    targetType,
    targetId,
    slotType,
    slotId,
    matchDate,
    matchDate,
    matchTime,
    matchTime,
    matchDate,
    todayStr,
  ];

  const { rows } = await pool.query(
    `SELECT o.*, r.*
     FROM offers o
     JOIN offer_rules r ON r.offer_id = o.offer_id
     WHERE o.active = true
       AND (
         o.rule_type = 'dynamic_pricing'
         OR $5::date > $10::date
       )
       AND (o.valid_from IS NULL OR o.valid_from::date <= $5::date)
       AND (o.valid_to IS NULL OR o.valid_to::date >= $6::date)
       AND (
            (r.applies_to_all = true AND r.target_type = $1)
         OR (r.target_type = $1 AND r.target_id IS NOT NULL AND $2::int IS NOT NULL AND r.target_id = $2::int)
       )
       AND ($3::text IS NULL OR r.slot_type IS NULL OR r.slot_type = $3::text)
       AND ($4::int IS NULL OR r.slot_id IS NULL OR r.slot_id = $4::int)
       AND (r.date_from IS NULL OR r.date_from::date <= $5::date)
       AND (r.date_to IS NULL OR r.date_to::date >= $6::date)
       AND ($7::time IS NULL OR r.time_from IS NULL OR r.time_from <= $7::time)
       AND ($8::time IS NULL OR r.time_to IS NULL OR r.time_to >= $8::time)
       AND (r.specific_date IS NULL OR r.specific_date = $5::date)
       AND (
            r.specific_time IS NULL
         OR $7::time IS NULL
         OR r.specific_time = $7::time
       )
       AND (
            r.day_type IS NULL
         OR (
              r.day_type = 'weekday'
             AND EXTRACT(DOW FROM $9::date) BETWEEN 1 AND 5
           )
        OR (
             r.day_type = 'weekend'
             AND EXTRACT(DOW FROM $9::date) IN (0,6)
           )
        OR (
             r.day_type = 'custom'
             AND r.specific_days IS NOT NULL
             AND (EXTRACT(DOW FROM $9::date)) = ANY(r.specific_days::int[])
           )
        OR (
             r.day_type = 'holiday'
           )
        )
      AND (
           r.specific_days IS NULL
        OR array_length(r.specific_days::int[], 1) IS NULL
        OR (EXTRACT(DOW FROM $9::date)) = ANY(r.specific_days::int[])
        )
     ORDER BY r.rule_id DESC
     LIMIT 1`,
    params
  );

  if (!rows.length) return null;
  const offer = mapOffer(rows[0]);
  const rule = mapRule(rows[0]);
  return { offer, rule };
}

// Helper: generate virtual slots for a date range and time window
function generateVirtualSlots({ type, targetId, dateFrom, dateTo, timeFrom, timeTo, capacity = 20 }) {
  const slots = [];
  const start = new Date(dateFrom);
  const end = new Date(dateTo);
  const [startHour, startMin] = (timeFrom || '10:00').split(':').map(Number);
  const [endHour, endMin] = (timeTo || '20:00').split(':').map(Number);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dateStr = d.toISOString().slice(0, 10);
    for (let h = startHour; h <= endHour; h++) {
      const slotStart = `${String(h).padStart(2, '0')}:${String(h === startHour ? startMin : 0).padStart(2, '0')}:00`;
      const slotEnd = `${String(h + 1).padStart(2, '0')}:${String(h === endHour ? endMin : 0).padStart(2, '0')}:00`;
      if (slotStart >= (timeFrom || '10:00') && slotEnd <= (timeTo || '20:00')) {
        const base = {
          start_date: dateStr,
          end_date: dateStr,
          start_time: slotStart,
          end_time: slotEnd,
          capacity,
          available: true,
          price: null,
          is_dynamic: true,
        };
        if (type === 'combo') {
          slots.push({ ...base, combo_slot_id: `${targetId}-${dateStr.replace(/-/g, '')}-${h}`, combo_id: targetId });
        } else {
          slots.push({ ...base, slot_id: `${targetId}-${dateStr.replace(/-/g, '')}-${h}`, attraction_id: targetId });
        }
      }
    }
  }
  return slots;
}

const enrichGeneratedSlotWithPricing = async (slot, offer, targetType) => {
  if (!slot || !offer) return slot;
  let targetDetails = null;
  try {
    if (targetType === 'combo' && slot.combo_id) {
      targetDetails = await comboService.getById(Number(slot.combo_id));
    } else if (slot.attraction_id) {
      targetDetails = await attractionService.getById(Number(slot.attraction_id));
    }
  } catch (err) {
    targetDetails = null;
  }

  const basePrice = targetType === 'combo'
    ? Number(targetDetails?.pricing?.base_price ?? targetDetails?.combo_price ?? targetDetails?.price ?? 0)
    : Number(targetDetails?.pricing?.base_price ?? targetDetails?.base_price ?? targetDetails?.price ?? 0);
  const resolvedBase = basePrice || Number(slot.price) || 0;
  if (!resolvedBase) return slot;

  // Dynamic import to avoid circular dependency
  const { applyOfferPricing } = require('../services/offerPricing');
  const pricing = await applyOfferPricing({
    targetType,
    targetId: targetType === 'combo' ? slot.combo_id : slot.attraction_id,
    slotType: targetType,
    slotId: slot.slot_id || slot.combo_slot_id || null,
    baseAmount: resolvedBase,
    booking_date: slot.start_date || null,
    booking_time: slot.start_time || null,
  });

  let finalPrice = pricing.unit;
  let discountAmount = pricing.discount;
  let discountPercent = pricing.discount_percent;

  const childAdjustments = pricing?.offer?.combo_child_adjustments;
  if (targetType === 'combo' && childAdjustments && targetDetails?.attraction_prices) {
    let newTotal = 0;
    const attractionPrices = { ...targetDetails.attraction_prices };
    for (const [attrId, price] of Object.entries(attractionPrices)) {
      const increment = Number(childAdjustments[attrId]) || 0;
      const adjustedPrice = Math.max(0, Number(price) + increment);
      newTotal += adjustedPrice;
    }
    finalPrice = newTotal;
    discountAmount = resolvedBase - finalPrice;
    discountPercent = resolvedBase > 0 ? (discountAmount / resolvedBase) * 100 : 0;
  }

  return {
    ...slot,
    base_price: resolvedBase,
    price: finalPrice,
    pricing: {
      base_price: resolvedBase,
      final_price: finalPrice,
      discount_amount: discountAmount,
      discount_percent: discountPercent,
      offer: pricing.offer,
    },
    offer: pricing.offer,
    offer_discount: discountAmount,
    offer_discount_percent: discountPercent,
  };
};

async function findOfferSlots(offer_id, { limit = 500 } = {}) {
  const offer = await getOfferById(offer_id);
  if (!offer || !Array.isArray(offer.rules) || !offer.rules.length) return { offer, slots: [] };

  const today = new Date().toISOString().slice(0, 10);
  const results = [];
  const seen = new Set();

  const add = (slot, meta) => {
    const key = `${meta.type}:${slot.slot_id || slot.combo_slot_id || slot.id}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push({ ...slot, _match: meta });
    }
  };

  for (const rule of offer.rules) {
    const {
      target_type,
      target_id,
      applies_to_all,
      slot_type,
      slot_id,
      date_from,
      date_to,
      time_from,
      time_to,
    } = rule;

    const targetType = target_type || slot_type || 'attraction';
    const dateFrom = date_from || offer.valid_from || today;
    const dateTo = date_to || offer.valid_to || today;

    // If rule targets a specific slot, just fetch that one
    if (slot_type && slot_id) {
      try {
        const slot =
          slot_type === 'combo'
            ? await comboSlotsModel.getSlotById(slot_id)
            : await attractionSlotsModel.getSlotById(slot_id);
        if (slot) add(slot, { type: slot_type, offer_id, rule_id: rule.rule_id });
      } catch { }
      continue;
    }

    // If applies_to_all, generate virtual slots for every attraction/combo in the date/time window
    if (applies_to_all) {
      const virtuals = generateVirtualSlots({
        type: targetType,
        targetId: null, // will be filled per target below
        dateFrom,
        dateTo,
        timeFrom: time_from || null,
        timeTo: time_to || null,
      });
      // For applies_to_all we need to enumerate actual targets; here we just show generic slots
      const priced = await mapSlotsWithPricing(virtuals, offer, targetType, target_id);
      priced.forEach((s) => add(s, { type: targetType, offer_id, rule_id: rule.rule_id }));
      continue;
    }

    // Specific target (attraction/combo) with date/time window
    if (target_id) {
      const virtuals = generateVirtualSlots({
        type: targetType,
        targetId: Number(target_id),
        dateFrom,
        dateTo,
        timeFrom: time_from || null,
        timeTo: time_to || null,
      });
      const priced = await mapSlotsWithPricing(virtuals, offer, targetType, target_id);
      priced.forEach((s) => add(s, { type: targetType, offer_id, rule_id: rule.rule_id }));
    }

    if (results.length >= limit) break;
  }

  return { offer, slots: results.slice(0, limit) };
}

async function mapSlotsWithPricing(slots, offer, targetType, targetId) {
  if (!Array.isArray(slots) || !slots.length) return slots;
  return Promise.all(slots.map((slot) => enrichGeneratedSlotWithPricing(slot, offer, targetType)));
}

/**
 * Count total tickets sold for a given offer on a specific date.
 * Counts bookings with payment_status IN ('Completed', 'Pending') to prevent overselling.
 */
async function getOfferTicketsSold(offer_id, date) {
  const { rows } = await pool.query(
    `SELECT COALESCE(SUM(b.quantity), 0)::int AS tickets_sold
     FROM bookings b
     WHERE b.offer_id = $1
       AND b.booking_date = $2::date
       AND b.payment_status IN ('Completed', 'Pending')`,
    [offer_id, date]
  );
  return rows[0]?.tickets_sold || 0;
}

/**
 * Get availability info for a first_n_tickets offer on a specific date.
 * Returns { ticket_limit, tickets_sold, tickets_remaining, is_sold_out }
 */
async function getOfferAvailability(offer_id, date) {
  const offer = await getOfferById(offer_id);
  if (!offer) return null;

  // Get ticket_limit from the first rule
  const firstRule = Array.isArray(offer.rules) && offer.rules.length > 0 ? offer.rules[0] : null;
  const ticket_limit = firstRule?.ticket_limit || null;
  const offer_price = firstRule?.offer_price || null;

  if (!ticket_limit) {
    return { ticket_limit: null, tickets_sold: 0, tickets_remaining: null, is_sold_out: false, offer_price };
  }

  const tickets_sold = await getOfferTicketsSold(offer_id, date);
  const tickets_remaining = Math.max(0, ticket_limit - tickets_sold);

  return {
    ticket_limit,
    tickets_sold,
    tickets_remaining,
    is_sold_out: tickets_remaining <= 0,
    offer_price,
  };
}

module.exports = {
  findOfferSlots,
  createOffer,
  getOfferById,
  listOffers,
  listOfferRules,
  replaceOfferRules,
  findApplicableOfferRule,
  updateOffer,
  deleteOffer,
  getOfferTicketsSold,
  getOfferAvailability,
};