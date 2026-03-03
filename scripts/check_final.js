const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        await client.connect();
        console.log('--- TABLES ---');
        const tables = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
        console.log(tables.rows.map(r => r.table_name).join(', '));

        console.log('--- ANNOUNCEMENTS ---');
        const res = await client.query('SELECT * FROM announcements');
        console.log('COUNT:', res.rows.length);
        console.log(JSON.stringify(res.rows, null, 2));

        console.log('--- END ---');
    } catch (err) {
        console.error('ERROR:', err);
    } finally {
        await client.end();
    }
}

run();
