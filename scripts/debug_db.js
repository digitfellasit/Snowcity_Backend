const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    try {
        await client.connect();
        const res = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';");
        console.log('Tables:', res.rows.map(r => r.table_name).join(', '));

        // Check if announcements table exists
        const hasAnn = res.rows.some(r => r.table_name === 'announcements');
        if (hasAnn) {
            const data = await client.query('SELECT * FROM announcements;');
            console.log('Announcements count:', data.rows.length);
            console.log('Data:', JSON.stringify(data.rows, null, 2));
        } else {
            console.log('ANNOUNCEMENTS TABLE MISSING!');
        }
    } catch (err) {
        console.error('DB ERROR:', err);
    } finally {
        await client.end();
    }
}

run().catch(console.error);
