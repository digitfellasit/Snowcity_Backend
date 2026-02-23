/**
 * Site Settings routes for SEO configuration
 * Public:  GET /api/site-settings/seo
 * Admin:   PUT /api/admin/site-settings/seo (handled via admin router)
 */
const router = require('express').Router();
const { pool } = require('../config/db');

// GET /api/site-settings/seo — Public: returns all seo.* settings as an object
router.get('/seo', async (req, res, next) => {
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

module.exports = router;
