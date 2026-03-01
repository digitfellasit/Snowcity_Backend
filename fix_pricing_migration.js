/**
 * Migration: Fix pricing configuration
 * 1. Update Snow Park base_price to 650
 * 2. Reset all offer_rules priorities to 0 (priority is no longer used)
 * 
 * Run: node fix_pricing_migration.js
 */
require('dotenv').config();
const { pool } = require('./config/db');

async function run() {
    console.log('=== Starting Pricing Fix Migration ===\n');

    // 1. Show current state of attractions
    console.log('--- Current Attractions ---');
    const { rows: before } = await pool.query(
        'SELECT attraction_id, title, base_price, active FROM attractions ORDER BY attraction_id'
    );
    console.table(before);

    // 2. Update Snow Park base_price to 650
    console.log('\n--- Updating Snow Park base_price to 650 ---');
    const { rowCount: snowParkUpdated } = await pool.query(
        `UPDATE attractions SET base_price = 650, updated_at = NOW() 
     WHERE LOWER(title) LIKE '%snow park%' AND base_price != 650`
    );
    console.log(`Snow Park rows updated: ${snowParkUpdated}`);

    // 3. Reset all offer_rules priorities to 0
    console.log('\n--- Resetting all offer_rules priorities to 0 ---');
    const { rowCount: priorityReset } = await pool.query(
        `UPDATE offer_rules SET priority = 0 WHERE priority != 0`
    );
    console.log(`Offer rules priority reset: ${priorityReset} rows`);

    // 4. Verify final state
    console.log('\n--- Final Attractions State ---');
    const { rows: after } = await pool.query(
        'SELECT attraction_id, title, base_price, active FROM attractions ORDER BY attraction_id'
    );
    console.table(after);

    // 5. Show offers and rules
    console.log('\n--- Current Offers ---');
    const { rows: offers } = await pool.query(
        'SELECT offer_id, title, rule_type, discount_type, discount_value, active, valid_from, valid_to FROM offers ORDER BY offer_id'
    );
    console.table(offers);

    console.log('\n--- Current Offer Rules ---');
    const { rows: rules } = await pool.query(
        `SELECT rule_id, offer_id, target_type, target_id, applies_to_all, 
            day_type, specific_days, priority, date_from, date_to 
     FROM offer_rules ORDER BY offer_id, rule_id`
    );
    console.table(rules);

    // 6. Show dynamic pricing rules
    console.log('\n--- Dynamic Pricing Rules ---');
    const { rows: dpRules } = await pool.query(
        'SELECT * FROM dynamic_pricing_rules ORDER BY rule_id'
    );
    console.table(dpRules);

    console.log('\n=== Migration Complete ===');
    process.exit(0);
}

run().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
