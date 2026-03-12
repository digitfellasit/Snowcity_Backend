// site/routes/combos.public.js
const router = require('express').Router();
const { pool } = require('../config/db');
const comboService = require('../services/comboService');
const comboSlotsController = require('../user/controllers/comboSlots.controller');

// GET /api/combos?active=true
router.get('/combos', async (req, res, next) => {
  try {
    const active = String(req.query.active || '').toLowerCase() === 'true';
    const sql = `
      SELECT
        c.combo_id, c.combo_price, c.discount_percent, c.active, c.created_at, c.updated_at,
        a1.attraction_id AS attraction_1_id, a2.attraction_id AS attraction_2_id,
        a1.title AS attraction_1_title, a2.title AS attraction_2_title,
        a1.image_url AS attraction_1_image, a2.image_url AS attraction_2_image,
        a1.base_price AS attraction_1_price, a2.base_price AS attraction_2_price
      FROM combos c
      JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
      JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
      ${active ? 'WHERE c.active = TRUE' : ''}
      ORDER BY c.combo_id DESC
    `;
    const { rows } = await pool.query(sql);
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/combos/:id
router.get('/combos/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });
    const { rows } = await pool.query(
      `SELECT
         c.combo_id, c.combo_price, c.discount_percent, c.active, c.created_at, c.updated_at,
         a1.attraction_id AS attraction_1_id, a2.attraction_id AS attraction_2_id,
         a1.title AS attraction_1_title, a2.title AS attraction_2_title,
         a1.image_url AS attraction_1_image, a2.image_url AS attraction_2_image,
         a1.base_price AS attraction_1_price, a2.base_price AS attraction_2_price
       FROM combos c
       JOIN attractions a1 ON a1.attraction_id = c.attraction_1_id
       JOIN attractions a2 ON a2.attraction_id = c.attraction_2_id
       WHERE c.combo_id = $1
       LIMIT 1`,
      [id]
    );
    const row = rows[0];
    if (!row) return res.status(404).json({ error: 'Combo not found' });
    res.json(row);
  } catch (err) { next(err); }
});

// GET /api/combos/:id/slots?date=YYYY-MM-DD
router.get('/combos/:id/slots', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid id' });

    const date = req.query.date || null;
    const params = [id];
    let whereDate = '';
    if (date) {
      params.push(date);
      whereDate = `AND $2::date BETWEEN cs.start_date AND cs.end_date`;
    }

    const { rows } = await pool.query(
      `SELECT cs.combo_slot_id, cs.combo_id, cs.start_date, cs.end_date,
              cs.start_time, cs.end_time, cs.capacity, cs.price, cs.available
       FROM combo_slots cs
       WHERE cs.combo_id = $1 ${whereDate}
       AND cs.available = TRUE
       ORDER BY cs.start_date ASC, cs.start_time ASC`,
      params
    );

    const to12 = (t) => {
      const [H, M] = String(t).split(':').map(Number);
      const ap = H >= 12 ? 'pm' : 'am';
      let h = H % 12; if (h === 0) h = 12;
      return `${String(h).padStart(2, '0')}.${String(M || 0).padStart(2, '0')}${ap}`;
    };

    const combo = await comboService.getById(id);
    let enrichedRows = rows;
    if (combo && enrichedRows.length > 0) {
      enrichedRows = await comboSlotsController.mapSlotsWithPricing(rows, combo, date);
    }

    res.json(
      enrichedRows.map((r) => ({
        ...r,
        start_time_12h: to12(r.start_time),
        end_time_12h: to12(r.end_time),
      }))
    );
  } catch (err) { next(err); }
});

module.exports = router;