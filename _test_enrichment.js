require('dotenv').config();
const { pool } = require('./config/db');
const comboService = require('./services/comboService');
const comboSlotsController = require('./user/controllers/comboSlots.controller');

async function testApiEnrichment() {
  try {
    // 1. Find a combo ID with an active dynamic pricing rule
    const { rows: rules } = await pool.query("SELECT target_id FROM dynamic_pricing_rules WHERE active=true AND target_type='combo' ORDER BY created_at DESC LIMIT 1");
    if (!rules.length) {
      console.log('No active combo rules found.');
      return;
    }
    const comboId = rules[0].target_id;
    console.log(`Testing combo ID: ${comboId}`);

    // 2. Simulate the database query from combos.public.js
    const date = '2026-03-14'; // Saturday
    const { rows } = await pool.query(
      `SELECT cs.combo_slot_id, cs.combo_id, cs.start_date, cs.end_date,
              cs.start_time, cs.end_time, cs.capacity, cs.price, cs.available
       FROM combo_slots cs
       WHERE cs.combo_id = $1 AND $2::date BETWEEN cs.start_date AND cs.end_date
       AND cs.available = TRUE
       ORDER BY cs.start_date ASC, cs.start_time ASC
       LIMIT 2`, // Just get a couple of slots to test
      [comboId, date]
    );

    if (!rows.length) {
      console.log(`No slots found for combo ${comboId} on ${date}`);
      return;
    }

    console.log(`Found ${rows.length} raw slots.`);
    console.log(`Raw Slot 0 price: ${rows[0].price}`);

    // 3. Simulate the enrichment process
    const combo = await comboService.getById(comboId);
    if (!combo) {
      console.log('Combo not found in DB.');
      return;
    }

    let enrichedRows = await comboSlotsController.mapSlotsWithPricing(rows, combo, date);
    
    // 4. Output the exact JSON structure of the first enriched row
    console.log('\n=== Enriched Slot payload ===');
    console.log(JSON.stringify(enrichedRows[0], null, 2));

  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

testApiEnrichment();
