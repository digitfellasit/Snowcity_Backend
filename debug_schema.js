const { pool } = require('./config/db');
async function run() {
    try {
        const res = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'attractions'");
        console.log(JSON.stringify(res.rows, null, 2));
        const res2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'combos'");
        console.log(JSON.stringify(res2.rows, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        process.exit(0);
    }
}
run();
