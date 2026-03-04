const { pool } = require('../config/db');

async function checkSchema() {
    try {
        console.log('Connecting to database using project config...');
        const client = await pool.connect();
        console.log('Connected to database.');

        const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'blogs'
      ORDER BY ordinal_position;
    `);

        console.log('\nColumns in "blogs" table:');
        res.rows.forEach(row => {
            console.log(`- ${row.column_name} (${row.data_type})`);
        });

        client.release();
    } catch (err) {
        console.error('Error checking schema:', err.message);
        if (err.stack) console.error(err.stack);
    } finally {
        await pool.end();
    }
}

checkSchema();
