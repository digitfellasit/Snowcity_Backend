require('dotenv').config();
const { pool } = require('./config/db');

async function inspect() {
    console.log('--- Starting Inspection ---');
    try {
        const combos = await pool.query('SELECT name, slug FROM combos LIMIT 20');
        console.log('--- Combos in DB ---');
        console.table(combos.rows);

        const blogs = await pool.query('SELECT title, slug FROM blogs LIMIT 20');
        console.log('--- Blogs in DB ---');
        console.table(blogs.rows);

        const pages = await pool.query('SELECT title, slug FROM cms_pages LIMIT 20');
        console.log('--- CMS Pages in DB ---');
        console.table(pages.rows);

        const attrs = await pool.query('SELECT title, slug FROM attractions LIMIT 20');
        console.log('--- Attractions in DB ---');
        console.table(attrs.rows);

        const media = await pool.query('SELECT media_id, url_path, filename FROM media_files LIMIT 20');
        console.log('--- Media Files in DB ---');
        console.table(media.rows);

    } catch (err) {
        console.error('Error during inspection:', err);
    } finally {
        console.log('--- Inspection Finished ---');
        await pool.end();
    }
}

inspect();
