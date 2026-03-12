const comboService = require('../../services/comboService');
const { applyOfferPricing } = require('../../services/offerPricing');

const comboSlotsController = require('./comboSlots.controller');

// GET /api/combos
exports.listCombos = async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    const data = await comboService.list({ active });
    res.json({ data, meta: { count: data.length } });
  } catch (err) {
    next(err);
  }
};

// GET /api/combos/:id
exports.getComboById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await comboService.getById(id);
    res.json(row);
  } catch (err) {
    next(err);
  }
};

// GET /api/combos/slug/:slug
exports.getComboBySlug = async (req, res, next) => {
  try {
    const slug = req.params.slug;
    const row = await comboService.getBySlug(slug);
    res.json(row);
  } catch (err) {
    next(err);
  }
};

// GET /api/combos/:id/slots?date=YYYY-MM-DD
exports.getComboSlots = async (req, res, next) => {
  try {
    const comboId = Number(req.params.id);
    const { date } = req.query;

    console.log('🎯 Combo Slots API called:', { comboId, date });

    if (!comboId) {
      return res.status(400).json({ error: 'combo_id is required' });
    }

    if (!date) {
      return res.status(400).json({ error: 'date is required' });
    }

    // Get combo details
    const combo = await comboService.getById(comboId);
    console.log('📋 Combo found:', !!combo, combo?.name);

    if (!combo) {
      return res.status(404).json({ error: 'Combo not found' });
    }

    // Calculate slot duration based on number of attractions with time_slot_enabled = true
    const { pool } = require('../../config/db');
    let attractionCount = 1;
    if (combo.attraction_ids && combo.attraction_ids.length > 0) {
      const { rows: attrRows } = await pool.query(
        `SELECT COUNT(*)::int AS cnt FROM attractions WHERE attraction_id = ANY($1) AND time_slot_enabled = true`,
        [combo.attraction_ids]
      );
      attractionCount = attrRows[0]?.cnt || 1;
    }
    const slotDuration = Math.max(attractionCount, 1); // At least 1 hour

    console.log('🔢 Slot details:', { attractionCount, slotDuration });

    // Import the slot generation function
    const { generateDynamicSlotsForDateRange } = require('../../models/comboSlots.model');

    // Generate slots for the single date
    const startDate = new Date(date);
    const endDate = new Date(date); // Same day

    console.log('📅 Generating slots for:', { startDate, endDate });

    const slots = generateDynamicSlotsForDateRange(
      comboId,
      startDate,
      endDate,
      slotDuration
    );

    console.log('🎰 Slots generated:', slots.length);

    // Include combo details in the response
    const slotsWithComboDetails = slots.map(slot => ({
      ...slot,
      combo_name: combo.name,
      combo_details: {
        name: combo.name,
        attraction_count: attractionCount,
        slot_duration: slotDuration,
        total_price: combo.total_price
      }
    }));
    const slotsWithPricing = await comboSlotsController.mapSlotsWithPricing(slotsWithComboDetails, combo, date);

    const response = {
      data: slotsWithPricing,
      meta: {
        count: slots.length,
        combo: {
          id: combo.combo_id || combo.id,
          name: combo.name,
          attraction_count: attractionCount,
          slot_duration: slotDuration
        }
      }
    };

    console.log('✅ Response prepared:', response.meta.count, 'slots');
    res.json(response);
  } catch (err) {
    console.error('❌ Combo slots error:', err);
    next(err);
  }
};