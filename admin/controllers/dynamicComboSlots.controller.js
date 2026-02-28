const comboSlotsModel = require('../../models/comboSlots.model');

exports.listComboSlots = async (req, res, next) => {
  try {
    const { combo_id, start_date, end_date } = req.query;

    if (!combo_id) {
      return res.status(400).json({ error: 'combo_id is required' });
    }

    // Get combo details to determine slot duration
    const combosModel = require('../../models/combos.model');
    const combo = await combosModel.getComboById(combo_id);
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

    // Generate dynamic slots for the requested date range
    const startDate = start_date ? new Date(start_date) : new Date();
    const endDate = end_date ? new Date(end_date) : new Date(startDate.getTime() + 365 * 24 * 60 * 60 * 1000); // Default 1 year

    const slots = generateDynamicSlotsForDateRange(
      combo_id,
      startDate,
      endDate,
      slotDuration
    );

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

    res.json({
      data: slotsWithComboDetails,
      meta: {
        count: slots.length,
        combo: {
          id: combo.combo_id,
          name: combo.name,
          attraction_count: attractionCount,
          slot_duration: slotDuration
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

exports.getComboSlotById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    // For dynamic slots, generate virtual slot ID
    const row = await comboSlotsModel.getSlotById(id);
    if (!row) return res.status(404).json({ error: 'Combo slot not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.createComboSlot = async (req, res, next) => {
  try {
    // For dynamic slots, we don't create in database
    res.status(400).json({
      error: 'Dynamic slots cannot be created in database',
      message: 'Combo slots are generated dynamically based on calendar'
    });
  } catch (err) {
    next(err);
  }
};

exports.updateComboSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const row = await comboSlotsModel.updateSlot(id, req.body || {});
    if (!row) return res.status(404).json({ error: 'Combo slot not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
};

exports.deleteComboSlot = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const ok = await comboSlotsModel.deleteSlot(id);
    if (!ok) return res.status(404).json({ error: 'Combo slot not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
};

// Helper function to generate dynamic slots for date range
function generateDynamicSlotsForDateRange(comboId, startDate, endDate, slotDuration) {
  const slots = [];
  const startHour = 10; // 10:00 AM
  const endHour = 20;   // 8:00 PM

  const current = new Date(startDate);

  while (current <= endDate) {
    const dateStr = current.toISOString().slice(0, 10);

    // Generate slots throughout the day
    for (let hour = startHour; hour + slotDuration <= endHour; hour++) {
      const startTime = `${hour.toString().padStart(2, '0')}:00:00`;
      const endTime = `${(hour + slotDuration).toString().padStart(2, '0')}:00:00`;

      // Generate virtual slot ID
      const virtualSlotId = `${comboId}-${dateStr.replace(/-/g, '')}-${hour.toString().padStart(2, '0')}`;

      slots.push({
        combo_slot_id: virtualSlotId,
        combo_id: comboId,
        start_date: dateStr,
        end_date: dateStr,
        start_time: startTime,
        end_time: endTime,
        capacity: 300,
        price: null,
        available: true,
        is_dynamic: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}
