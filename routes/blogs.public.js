// site/routes/blogs.public.js
const router = require('express').Router();
const { pool } = require('../config/db');

// GET /api/blogs
router.get('/blogs', async (req, res, next) => {
  try {
    const active = String(req.query.active || '').toLowerCase() === 'true';
    const q = (req.query.q || '').toString().trim();
    const params = [];
    const where = [];
    if (active) where.push('b.active = TRUE');
    if (q) { params.push(`%${q}%`); where.push(`(b.title ILIKE $${params.length} OR b.slug ILIKE $${params.length})`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT blog_id, title, slug, image_url, author, short_description, content, section_type, created_at
       FROM blogs b
       ${whereSql}
       ORDER BY created_at DESC
       LIMIT 100`
    );
    res.json(rows);
  } catch (err) { next(err); }
});

// GET /api/blogs/slug/:slug
router.get('/blogs/slug/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).json({ error: 'slug required' });
    const { rows } = await pool.query(
      `SELECT
         blog_id, title, slug, active, image_url, image_alt, author,
         editor_mode, content, raw_html, raw_css, raw_js,
         meta_title, meta_description, meta_keywords,
         faq_items, head_schema, body_schema, footer_schema,
         created_at, updated_at
       FROM blogs
       WHERE active = TRUE AND LOWER(slug) = LOWER($1)
       LIMIT 1`,
      [slug]
    );
    const blog = rows[0];
    if (!blog) return res.status(404).json({ error: 'Blog not found' });
    res.json(blog);
  } catch (err) { next(err); }
});

module.exports = router;