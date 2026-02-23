// site/routes/pages.public.js
const router = require('express').Router();
const { pool } = require('../config/db');

// GET /api/pages/slug/:slug (active-only)
router.get('/pages/slug/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'slug required' });

    const { rows } = await pool.query(
      `SELECT
         page_id, title, slug, active,
         editor_mode, content, raw_html, raw_css, raw_js,
         meta_title, meta_description, meta_keywords,
         nav_group, nav_order, placement, placement_ref_id,
         faq_items, head_schema, body_schema, footer_schema,
         created_at, updated_at
       FROM cms_pages
       WHERE active = TRUE AND LOWER(slug) = LOWER($1)
       LIMIT 1`,
      [slug]
    );
    const page = rows[0];
    if (!page) return res.status(404).json({ error: 'Page not found' });
    res.json(page);
  } catch (err) { next(err); }
});

// Optional: list by nav group (for Visitors Guide)
router.get('/pages', async (req, res, next) => {
  try {
    const group = (req.query.group || '').toString().trim();
    const active = String(req.query.active || '').toLowerCase() === 'true';
    const params = [];
    const where = [];
    if (active) where.push('p.active = TRUE');
    if (group) { where.push('LOWER(p.nav_group) = LOWER($1)'); params.push(group); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT page_id, title, slug, nav_order
       FROM cms_pages p
       ${whereSql}
       ORDER BY nav_order ASC, LOWER(title) ASC`,
      params
    );
    res.json(rows);
  } catch (err) { next(err); }
});

module.exports = router;