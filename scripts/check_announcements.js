const { Client } = require('pg');
require('dotenv').config();

const client = new Client({
    connectionString: process.env.DATABASE_URL
});

async function run() {
    await client.connect();
    const res = await client.query('SELECT * FROM announcements;');
    console.log(JSON.stringify(res.rows, null, 2));
    await client.end();
}

run().catch(console.error);
