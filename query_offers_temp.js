require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

(async () => {
    try {
        const { rows: offers } = await pool.query(
            'SELECT offer_id, title, rule_type, discount_type, discount_value, active, valid_from, valid_to FROM offers ORDER BY created_at DESC'
        );

        const { rows: rules } = await pool.query(
            'SELECT rule_id, offer_id, target_type, target_id, applies_to_all, day_type, specific_days, date_from, date_to, time_from, time_to, specific_date, specific_time, priority, rule_discount_type, rule_discount_value FROM offer_rules ORDER BY offer_id, rule_id'
        );

        const { rows: dp } = await pool.query('SELECT rule_id, name, target_type, target_id, date_ranges, price_adjustment_type, price_adjustment_value, active FROM dynamic_pricing_rules ORDER BY created_at DESC LIMIT 10');

        const output = JSON.stringify({ offers, rules, dynamic_pricing: dp }, null, 2);
        fs.writeFileSync('c:/Users/dfuser/Desktop/New/Snowcity-Backend-main/db_offers_data.json', output, 'utf8');
        console.log('Done - wrote to db_offers_data.json');
    } catch (err) {
        console.error('Error:', err.message);
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
