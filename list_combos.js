require('dotenv').config();
const { pool } = require('./config/db');
(async () => {
    try {
        const r = await pool.query("SELECT combo_id, name, day_rule_type, custom_days FROM combos");
        console.log(JSON.stringify(r.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await pool.end();
        process.exit(0);
    }
})();
