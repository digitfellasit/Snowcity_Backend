/**
 * Admin Site Settings routes — SEO configuration management
 * PUT /api/admin/site-settings/seo — Bulk upsert seo.* settings
 * GET /api/admin/site-settings/seo — Get all seo.* settings
 */
const router = require('express').Router();
const { pool } = require('../../config/db');
const { requirePermissions } = require('../middleware/permissionGuard');

// GET — fetch all seo.* settings
router.get('/seo', requirePermissions('settings:read'), async (req, res, next) => {
    try {
        const { rows } = await pool.query(
            `SELECT key_name, key_value FROM settings WHERE key_name ILIKE 'seo.%' ORDER BY key_name`
        );
        const settings = {};
        for (const row of rows) {
            const key = row.key_name.replace(/^seo\./, '');
            let val = row.key_value;
            try { val = JSON.parse(val); } catch { /* keep as string */ }
            settings[key] = val;
        }
        res.json(settings);
    } catch (err) {
        next(err);
    }
});

// PUT — bulk upsert seo.* settings
router.put('/seo', requirePermissions('settings:write'), async (req, res, next) => {
    try {
        const body = req.body || {};
        const allowedKeys = [
            'organization_schema', 'head_schema', 'body_schema', 'footer_schema',
            'site_name', 'default_image',
        ];

        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const key of allowedKeys) {
                if (body[key] !== undefined) {
                    const val = typeof body[key] === 'object' ? JSON.stringify(body[key]) : String(body[key]);
                    await client.query(
                        `INSERT INTO settings (key_name, key_value)
             VALUES ($1, $2)
             ON CONFLICT (key_name) DO UPDATE
             SET key_value = EXCLUDED.key_value, updated_at = NOW()`,
                        [`seo.${key}`, val]
                    );
                }
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }

        // Return updated settings
        const { rows } = await pool.query(
            `SELECT key_name, key_value FROM settings WHERE key_name ILIKE 'seo.%' ORDER BY key_name`
        );
        const settings = {};
        for (const row of rows) {
            const key = row.key_name.replace(/^seo\./, '');
            let val = row.key_value;
            try { val = JSON.parse(val); } catch { /* keep as string */ }
            settings[key] = val;
        }
        res.json({ message: 'SEO settings updated', settings });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
