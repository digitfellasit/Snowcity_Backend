/**
 * Performance Indexes Migration
 * Creates indexes on frequently queried columns to speed up API responses.
 * 
 * Run: node migrations/performance_indexes.js
 */
const { pool } = require('../config/db');

async function migrate() {
    const client = await pool.connect();
    try {
        console.log('Creating performance indexes...');

        const indexes = [
            // Attraction slug lookups
            `CREATE INDEX IF NOT EXISTS idx_attractions_slug ON attractions(slug)`,
            // Combo slug lookups
            `CREATE INDEX IF NOT EXISTS idx_combos_slug ON combos(slug)`,
            // Banner queries (active banners ordered by display)
            `CREATE INDEX IF NOT EXISTS idx_banners_active ON banners(is_active, display_order)`,
            // Blog listings (published blogs)
            `CREATE INDEX IF NOT EXISTS idx_blogs_status ON blogs(status, published_at DESC)`,
            // Order cleanup cron job
            `CREATE INDEX IF NOT EXISTS idx_orders_pending_cleanup ON orders(payment_status, created_at) WHERE payment_status = 'Pending'`,
            // CMS pages by slug
            `CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug)`,
            // Pages navigation group
            `CREATE INDEX IF NOT EXISTS idx_cms_pages_nav ON cms_pages(nav_group) WHERE nav_group IS NOT NULL`,
        ];

        for (const sql of indexes) {
            try {
                await client.query(sql);
                console.log(`  ✓ ${sql.split(' ON ')[0].replace('CREATE INDEX IF NOT EXISTS ', '')}`);
            } catch (err) {
                // Skip if table doesn't exist
                if (err.code === '42P01') {
                    console.log(`  ⊘ Skipped (table not found): ${sql.split(' ON ')[1]?.split('(')[0]}`);
                } else {
                    console.error(`  ✗ Error: ${err.message}`);
                }
            }
        }

        console.log('Performance indexes created successfully.');
    } finally {
        client.release();
    }
}

migrate()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
