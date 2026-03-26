// site/routes/blogs.public.js
const router = require('express').Router();
const { pool } = require('../config/db');

// GET /api/blogs
router.get('/blogs', async (req, res, next) => {
  try {
    const active = req.query.active === undefined ? true : String(req.query.active).toLowerCase() === 'true';
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '12', 10), 1), 100);
    const offset = (page - 1) * limit;

    const params = [];
    const where = [];
    if (active) where.push('b.active = TRUE');
    if (q) {
      params.push(`%${q}%`);
      where.push(`(b.title ILIKE $${params.length} OR b.slug ILIKE $${params.length})`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT blog_id, title, slug, image_url, image_alt, author, short_description, content, section_type, created_at,
              COUNT(*) OVER() as total_count
       FROM blogs b
       ${whereSql}
       ORDER BY COALESCE(created_at, NOW()) DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const data = rows.map(row => {
      const { total_count, ...blog } = row;
      return blog;
    });

    const totalCount = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data,
      meta: {
        totalCount,
        totalPages,
        page,
        limit,
        hasMore: page < totalPages
      }
    });
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