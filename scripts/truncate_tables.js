const { Client } = require('pg');
require('dotenv').config();

const EXCLUDED_TABLES = [
    'blogs',
    'cms_pages',
    'admin_access',
    'users',
    'permissions',
    'role_permissions',
    'roles',
    'user_roles',
    'settings',
    'spatial_ref_sys'
];

async function truncateTables() {
    const client = new Client({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });

    try {
        await client.connect();
        console.log('Connected to database.');

        // Fetch all tables in the public schema
        const res = await client.query(`
            SELECT tablename 
            FROM pg_catalog.pg_tables 
            WHERE schemaname = 'public'
        `);

        const tables = res.rows.map(row => row.tablename);
        const tablesToTruncate = tables.filter(table => !EXCLUDED_TABLES.includes(table));

        if (tablesToTruncate.length === 0) {
            console.log('No tables to truncate.');
            return;
        }

        console.log('Tables to truncate:', tablesToTruncate.join(', '));
        console.log('Preserving:', EXCLUDED_TABLES.join(', '));

        const truncateQuery = `TRUNCATE TABLE ${tablesToTruncate.map(t => `"${t}"`).join(', ')} CASCADE;`;

        console.log('Executing truncation...');
        await client.query(truncateQuery);
        console.log('Truncation successful.');

    } catch (err) {
        console.error('Error during truncation:', err);
    } finally {
        await client.end();
    }
}

truncateTables();
