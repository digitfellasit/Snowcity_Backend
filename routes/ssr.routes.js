/**
 * SSR Routes — Server-Side Rendered pages for SEO crawlers
 *   GET /blog/:slug   → Full HTML for blog post
 *   GET /page/:slug   → Full HTML for CMS page
 *   GET /sitemap.xml  → XML sitemap of all active blogs + pages
 */
const router = require('express').Router();
const { pool } = require('../config/db');
const { buildSeoHtml } = require('../utils/ssrTemplate');

console.log('SSR Router Loading...');

// Helper: load all seo.* settings
async function loadSeoSettings() {
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
        return settings;
    } catch {
        return {};
    }
}

// Determine client URL from env
function getClientUrl() {
    return process.env.CLIENT_URL || 'https://snowpark.netlify.app';
}

// ── SSR Preview (Admin) ──────────────────────────────────────────────────
router.post('/preview', async (req, res) => {
    try {
        const data = req.body;
        const siteSettings = await loadSeoSettings();

        const html = buildSeoHtml({
            title: data.meta_title || data.title || 'Preview',
            description: data.meta_description || '',
            keywords: data.meta_keywords || '',
            canonical: '#',
            image: data.image_url || data.hero_image || '',
            imageAlt: data.image_alt || data.hero_image_alt || '',
            content: data.editor_mode === 'raw' ? (data.raw_html || '') : (data.content || ''),
            faq_items: data.faq_items || [],
            head_schema: data.head_schema || {},
            body_schema: data.body_schema || {},
            footer_schema: data.footer_schema || {},
            siteSettings,
            type: data.author ? 'blog' : 'page',
            author: data.author || '',
            clientUrl: '#',
        });

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.send(html);
    } catch (err) {
        res.status(500).send(`Preview Error: ${err.message}`);
    }
});

// ── SSR Root (Home Page) ────────────────────────────────────────────────
router.get('/', async (req, res, next) => {
    console.log('SSR Root Hit');
    try {
        const siteSettings = await loadSeoSettings();
        const clientUrl = getClientUrl();

        res.set('Content-Type', 'text/html; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
        res.send(html);
    } catch (err) {
        next(err);
    }
});

// ── SSR Blog (301 redirect to canonical /:slug) ────────────────────────
router.get('/blog/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).send('slug required');
    console.log('SSR Blog 301 redirect:', slug);
    return res.redirect(301, `/${slug}`);
});

// ── SSR Page (301 redirect to canonical /:slug) ────────────────────────
router.get('/page/:slug', (req, res) => {
    const slug = String(req.params.slug || '').trim();
    if (!slug) return res.status(400).send('slug required');
    console.log('SSR Page 301 redirect:', slug);
    return res.redirect(301, `/${slug}`);
});

// ── XML Sitemap ─────────────────────────────────────────────────────────
router.get('/sitemap.xml', async (req, res, next) => {
    console.log('SSR Sitemap Hit');
    try {
        const clientBase = getClientUrl();

        const [blogsRes, pagesRes, attractionsRes, combosRes] = await Promise.all([
            pool.query(`SELECT slug, updated_at FROM blogs WHERE active = TRUE ORDER BY updated_at DESC`),
            pool.query(`SELECT slug, updated_at FROM cms_pages WHERE active = TRUE ORDER BY updated_at DESC`),
            pool.query(`SELECT slug, updated_at FROM attractions WHERE active = TRUE ORDER BY updated_at DESC`).catch(() => ({ rows: [] })),
            pool.query(`SELECT slug, updated_at FROM combos WHERE active = TRUE ORDER BY updated_at DESC`).catch(() => ({ rows: [] })),
        ]);

        let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${clientBase}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>`;

        for (const attraction of attractionsRes.rows) {
            const lastmod = attraction.updated_at ? new Date(attraction.updated_at).toISOString().split('T')[0] : '';
            xml += `
  <url>
    <loc>${clientBase}/${attraction.slug}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
        }

        for (const combo of combosRes.rows) {
            const lastmod = combo.updated_at ? new Date(combo.updated_at).toISOString().split('T')[0] : '';
            xml += `
  <url>
    <loc>${clientBase}/${combo.slug}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.9</priority>
  </url>`;
        }

        for (const blog of blogsRes.rows) {
            const lastmod = blog.updated_at ? new Date(blog.updated_at).toISOString().split('T')[0] : '';
            xml += `
  <url>
    <loc>${clientBase}/${blog.slug}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>`;
        }

        for (const page of pagesRes.rows) {
            const lastmod = page.updated_at ? new Date(page.updated_at).toISOString().split('T')[0] : '';
            xml += `
  <url>
    <loc>${clientBase}/${page.slug}</loc>
    ${lastmod ? `<lastmod>${lastmod}</lastmod>` : ''}
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`;
        }

        xml += `
</urlset>`;

        res.set('Content-Type', 'application/xml; charset=utf-8');
        res.set('Cache-Control', 'public, max-age=3600, s-maxage=7200');
        res.send(xml);
    } catch (err) {
        next(err);
    }
});

// ── Catch-all /:slug (Tries attraction, combo, blog, page) ──────────
router.get('/:slug', async (req, res, next) => {
    console.log('SSR Catch-all Hit:', req.params.slug);
    try {
        const slug = String(req.params.slug || '').trim();
        if (!slug || slug.includes('.')) return next(); // skip static files, etc.

        // 1. Try Attraction
        const attractionRes = await pool.query(
            `SELECT * FROM attractions WHERE active = TRUE AND LOWER(slug) = LOWER($1) LIMIT 1`,
            [slug]
        ).catch(() => ({ rows: [] }));
        if (attractionRes.rows[0]) {
            const attr = attractionRes.rows[0];
            const siteSettings = await loadSeoSettings();
            const clientUrl = `${getClientUrl()}/${attr.slug}`;
            const html = buildSeoHtml({
                title: attr.meta_title || attr.title || attr.name,
                description: attr.meta_description || attr.short_description || '',
                keywords: attr.meta_keywords || '',
                canonical: clientUrl,
                image: attr.image_url || attr.hero_image || '',
                imageAlt: attr.image_alt || '',
                content: attr.description || attr.content || '',
                faq_items: attr.faq_items || [],
                head_schema: attr.head_schema || {},
                body_schema: attr.body_schema || {},
                footer_schema: attr.footer_schema || {},
                siteSettings,
                type: 'page',
                author: '',
                publishedDate: attr.created_at ? new Date(attr.created_at).toISOString() : '',
                modifiedDate: attr.updated_at ? new Date(attr.updated_at).toISOString() : '',
                clientUrl,
            });
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            return res.send(html);
        }

        // 2. Try Combo
        const comboRes = await pool.query(
            `SELECT * FROM combos WHERE active = TRUE AND LOWER(slug) = LOWER($1) LIMIT 1`,
            [slug]
        ).catch(() => ({ rows: [] }));
        if (comboRes.rows[0]) {
            const combo = comboRes.rows[0];
            const siteSettings = await loadSeoSettings();
            const clientUrl = `${getClientUrl()}/${combo.slug}`;
            const html = buildSeoHtml({
                title: combo.meta_title || combo.title || combo.name,
                description: combo.meta_description || combo.short_description || '',
                keywords: combo.meta_keywords || '',
                canonical: clientUrl,
                image: combo.image_url || combo.hero_image || '',
                imageAlt: combo.image_alt || '',
                content: combo.description || combo.content || '',
                faq_items: combo.faq_items || [],
                head_schema: combo.head_schema || {},
                body_schema: combo.body_schema || {},
                footer_schema: combo.footer_schema || {},
                siteSettings,
                type: 'page',
                author: '',
                publishedDate: combo.created_at ? new Date(combo.created_at).toISOString() : '',
                modifiedDate: combo.updated_at ? new Date(combo.updated_at).toISOString() : '',
                clientUrl,
            });
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            return res.send(html);
        }

        // 3. Try Blog
        const blogRes = await pool.query(
            `SELECT * FROM blogs WHERE active = TRUE AND LOWER(slug) = LOWER($1) LIMIT 1`,
            [slug]
        );
        if (blogRes.rows[0]) {
            const blog = blogRes.rows[0];
            const siteSettings = await loadSeoSettings();
            const clientUrl = `${getClientUrl()}/${blog.slug}`;
            const html = buildSeoHtml({
                title: blog.meta_title || blog.title,
                description: blog.meta_description || '',
                keywords: blog.meta_keywords || '',
                canonical: clientUrl,
                image: blog.image_url || '',
                imageAlt: blog.image_alt || '',
                content: blog.editor_mode === 'raw' ? (blog.raw_html || '') : (blog.content || ''),
                faq_items: blog.faq_items,
                head_schema: blog.head_schema,
                body_schema: blog.body_schema,
                footer_schema: blog.footer_schema,
                siteSettings,
                type: 'blog',
                author: blog.author || '',
                publishedDate: blog.created_at ? new Date(blog.created_at).toISOString() : '',
                modifiedDate: blog.updated_at ? new Date(blog.updated_at).toISOString() : '',
                clientUrl,
            });
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            return res.send(html);
        }

        // 4. Try Page
        const pageRes = await pool.query(
            `SELECT * FROM cms_pages WHERE active = TRUE AND LOWER(slug) = LOWER($1) LIMIT 1`,
            [slug]
        );
        if (pageRes.rows[0]) {
            const page = pageRes.rows[0];
            const siteSettings = await loadSeoSettings();
            const clientUrl = `${getClientUrl()}/${page.slug}`;
            const html = buildSeoHtml({
                title: page.meta_title || page.title,
                description: page.meta_description || '',
                keywords: page.meta_keywords || '',
                canonical: clientUrl,
                image: page.hero_image || page.image_url || '',
                imageAlt: page.hero_image_alt || '',
                content: page.editor_mode === 'raw' ? (page.raw_html || '') : (page.content || ''),
                faq_items: page.faq_items,
                head_schema: page.head_schema,
                body_schema: page.body_schema,
                footer_schema: page.footer_schema,
                siteSettings,
                type: 'page',
                author: '',
                publishedDate: page.created_at ? new Date(page.created_at).toISOString() : '',
                modifiedDate: page.updated_at ? new Date(page.updated_at).toISOString() : '',
                clientUrl,
            });
            res.set('Content-Type', 'text/html; charset=utf-8');
            res.set('Cache-Control', 'public, max-age=300, s-maxage=600');
            return res.send(html);
        }

        next(); // not found in any content type
    } catch (err) {
        next(err);
    }
});

module.exports = router;
