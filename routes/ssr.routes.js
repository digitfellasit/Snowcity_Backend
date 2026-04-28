/**
 * SSR Routes — Server-Side Rendered pages for SEO crawlers
 *
 * Sitemap Architecture (Industry Standard – Sitemap Index):
 *   GET /sitemap.xml              → Sitemap index (references all sub-sitemaps)
 *   GET /sitemap-static.xml       → All known static public pages
 *   GET /sitemap-attractions.xml  → Dynamic attraction + combo detail pages (with images)
 *   GET /sitemap-blogs.xml        → Dynamic blog posts (with images & dates)
 *   GET /sitemap-pages.xml        → CMS pages (privacy, terms, visitor-guide pages, etc.)
 *
 * Other SSR Routes:
 *   POST /preview       → Admin SSR preview
 *   GET  /blog/:slug    → 301 redirect to canonical /:slug
 *   GET  /page/:slug    → 301 redirect to canonical /:slug
 *   GET  /:slug         → Full SEO HTML rendering for crawlers
 */

const router = require('express').Router();
const { pool } = require('../config/db');
const { buildSeoHtml } = require('../utils/ssrTemplate');

console.log('SSR Router Loading...');

// ── Helpers ───────────────────────────────────────────────────────────────

/** Load all seo.* settings from DB */
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

/** Determine client (frontend) base URL from env */
function getClientUrl() {
    return (process.env.CLIENT_URL || 'https://www.snowcityblr.com').replace(/\/$/, '');
}

/** CloudFront CDN domain for building full image URLs */
const CDN_DOMAIN = process.env.CLOUDFRONT_DOMAIN || process.env.CDN_DOMAIN || '';

/**
 * Build an absolute image URL.
 * – If already absolute (http/https), return as-is.
 * – If a relative path and CDN is configured, prefix with CDN.
 * – Otherwise return null (omit from sitemap).
 */
function buildImageUrl(rawUrl) {
    if (!rawUrl) return null;
    const url = String(rawUrl).trim();
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (CDN_DOMAIN && url.startsWith('/')) return `https://${CDN_DOMAIN}${url}`;
    if (CDN_DOMAIN && !url.startsWith('/')) return `https://${CDN_DOMAIN}/${url}`;
    return null;
}

/** Escape XML special characters */
function esc(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/** Format a DB timestamp to YYYY-MM-DD, returning `fallback` if invalid */
function fmtDate(ts, fallback = '') {
    if (!ts) return fallback;
    try {
        return new Date(ts).toISOString().split('T')[0];
    } catch {
        return fallback;
    }
}

/** Build a single <url> block (with optional image) */
function urlEntry({ loc, lastmod, changefreq, priority, images = [] }) {
    const hasImages = Array.isArray(images) && images.length > 0;
    const imageNs = hasImages ? '' : ''; // namespace declared at urlset level
    let block = `
  <url>
    <loc>${esc(loc)}</loc>`;
    if (lastmod) block += `\n    <lastmod>${lastmod}</lastmod>`;
    if (changefreq) block += `\n    <changefreq>${changefreq}</changefreq>`;
    if (priority !== undefined && priority !== null) block += `\n    <priority>${priority}</priority>`;
    for (const img of images) {
        if (!img || !img.loc) continue;
        block += `
    <image:image>
      <image:loc>${esc(img.loc)}</image:loc>`;
        if (img.caption) block += `\n      <image:caption>${esc(img.caption)}</image:caption>`;
        if (img.title) block += `\n      <image:title>${esc(img.title)}</image:title>`;
        block += `\n    </image:image>`;
    }
    block += `\n  </url>`;
    return block;
}

/** Standard sitemap XML header with image namespace */
function sitemapHeader() {
    return `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.sitemaps.org/schemas/sitemap/0.9
    http://www.sitemaps.org/schemas/sitemap/0.9/sitemap.xsd">`;
}

/** Standard cache headers for sitemap responses */
function setSitemapHeaders(res, maxAge = 3600, sMaxAge = 7200) {
    res.set('Content-Type', 'application/xml; charset=utf-8');
    res.set('Cache-Control', `public, max-age=${maxAge}, s-maxage=${sMaxAge}`);
    res.set('X-Robots-Tag', 'noindex'); // sitemaps themselves shouldn't be indexed
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
        res.send(''); // placeholder — actual HTML served by frontend SPA
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


// ════════════════════════════════════════════════════════════════════════════
//  SITEMAP SUITE
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /sitemap.xml
 * Sitemap Index — the root entry point for all search engine crawlers.
 * References each category-specific sub-sitemap.
 * Industry standard for sites with multiple content types.
 */
router.get('/sitemap.xml', async (req, res, next) => {
    console.log('Sitemap Index Hit');
    try {
        const clientBase = getClientUrl();
        const today = new Date().toISOString().split('T')[0];

        // Get last-modified dates for each section
        const [blogsRes, attractionsRes, combosRes, pagesRes] = await Promise.all([
            pool.query(`SELECT MAX(COALESCE(updated_at, created_at)) AS latest FROM blogs WHERE active = TRUE`)
                .catch(() => ({ rows: [{ latest: null }] })),
            pool.query(`SELECT MAX(COALESCE(updated_at, created_at)) AS latest FROM attractions WHERE active = TRUE`)
                .catch(() => ({ rows: [{ latest: null }] })),
            pool.query(`SELECT MAX(COALESCE(updated_at, created_at)) AS latest FROM combos WHERE active = TRUE`)
                .catch(() => ({ rows: [{ latest: null }] })),
            pool.query(`SELECT MAX(COALESCE(updated_at, created_at)) AS latest FROM cms_pages WHERE active = TRUE`)
                .catch(() => ({ rows: [{ latest: null }] })),
        ]);

        const blogsLastmod       = fmtDate(blogsRes.rows[0]?.latest,       today);
        const attractionsLastmod = fmtDate(attractionsRes.rows[0]?.latest, today);
        const combosLastmod      = fmtDate(combosRes.rows[0]?.latest,      today);
        const attComboLastmod    = [attractionsLastmod, combosLastmod].sort().pop(); // most recent
        const pagesLastmod       = fmtDate(pagesRes.rows[0]?.latest,       today);

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>${esc(clientBase)}/sitemap-static.xml</loc>
    <lastmod>${today}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${esc(clientBase)}/sitemap-attractions.xml</loc>
    <lastmod>${attComboLastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${esc(clientBase)}/sitemap-blogs.xml</loc>
    <lastmod>${blogsLastmod}</lastmod>
  </sitemap>
  <sitemap>
    <loc>${esc(clientBase)}/sitemap-pages.xml</loc>
    <lastmod>${pagesLastmod}</lastmod>
  </sitemap>
</sitemapindex>`;

        setSitemapHeaders(res, 3600, 7200);
        res.send(xml);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /sitemap-static.xml
 * All known static public-facing pages.
 * These URLs are hard-coded in the router and never change.
 *
 * Priority tiers:
 *   1.0  → Home (highest — entry point for all visitors)
 *   0.9  → Booking / Tickets page (primary conversion page)
 *   0.8  → Core section listing pages (attractions, combos, blog listing)
 *   0.7  → Supporting pages (gallery, offers, visitor-guide, contact)
 */
router.get('/sitemap-static.xml', async (req, res, next) => {
    console.log('Sitemap Static Hit');
    try {
        const clientBase = getClientUrl();
        const today = new Date().toISOString().split('T')[0];

        const staticPages = [
            // ── Tier 1: Home ─────────────────────────────────────────
            { path: '/',                  changefreq: 'daily',   priority: 1.0 },

            // ── Tier 2: Core Conversion ───────────────────────────────
            { path: '/tickets-offers',    changefreq: 'daily',   priority: 0.9 },

            // ── Tier 3: Key Listing Pages ────────────────────────────
            { path: '/attractions',       changefreq: 'weekly',  priority: 0.85 },
            { path: '/combos',            changefreq: 'weekly',  priority: 0.85 },
            { path: '/blog',              changefreq: 'daily',   priority: 0.8  },

            // ── Tier 4: Supporting Pages ─────────────────────────────
            { path: '/offers',            changefreq: 'weekly',  priority: 0.75 },
            { path: '/gallery',           changefreq: 'weekly',  priority: 0.7  },
            { path: '/contact',           changefreq: 'monthly', priority: 0.7  },
            { path: '/visitor-guide/blogs',  changefreq: 'weekly',  priority: 0.65 },
            { path: '/visitor-guide/pages',  changefreq: 'monthly', priority: 0.6  },

            // ── Excluded (private / transactional / redirects) ───────
            // /my-bookings     → requires auth
            // /payment/*       → transactional
            // /payment-status  → transactional
            // /parkpanel/*     → admin panel
            // /404             → error page
            // /login           → redirect
            // /home            → redirect to /
        ];

        let xml = sitemapHeader();

        for (const page of staticPages) {
            xml += urlEntry({
                loc: `${clientBase}${page.path}`,
                lastmod: today,
                changefreq: page.changefreq,
                priority: page.priority,
            });
        }

        xml += '\n</urlset>';

        setSitemapHeaders(res, 3600, 86400); // cache 1hr locally, 24hr at CDN
        res.send(xml);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /sitemap-attractions.xml
 * Individual attraction detail pages + combo detail pages.
 * Includes <image:image> tags for better Google Image Search indexing.
 *
 * Priority:
 *   0.85 → Attractions (core product pages)
 *   0.8  → Combos (bundle pages)
 */
router.get('/sitemap-attractions.xml', async (req, res, next) => {
    console.log('Sitemap Attractions Hit');
    try {
        const clientBase = getClientUrl();

        const [attractionsRes, combosRes] = await Promise.all([
            pool.query(
                `SELECT slug, title, name, image_url, image_alt, updated_at, created_at
                 FROM attractions
                 WHERE active = TRUE
                 ORDER BY sort_order ASC, COALESCE(updated_at, created_at) DESC`
            ).catch(() => ({ rows: [] })),
            pool.query(
                `SELECT slug, title, name, combo_name, image_url, image_alt, updated_at, created_at
                 FROM combos
                 WHERE active = TRUE
                 ORDER BY sort_order ASC, COALESCE(updated_at, created_at) DESC`
            ).catch(() => ({ rows: [] })),
        ]);

        let xml = sitemapHeader();

        for (const attr of attractionsRes.rows) {
            if (!attr.slug) continue;
            const lastmod  = fmtDate(attr.updated_at || attr.created_at);
            const imageUrl = buildImageUrl(attr.image_url);
            const label    = attr.title || attr.name || '';

            xml += urlEntry({
                loc: `${clientBase}/${attr.slug}`,
                lastmod,
                changefreq: 'weekly',
                priority: 0.85,
                images: imageUrl
                    ? [{ loc: imageUrl, caption: label, title: label }]
                    : [],
            });
        }

        for (const combo of combosRes.rows) {
            if (!combo.slug) continue;
            const lastmod  = fmtDate(combo.updated_at || combo.created_at);
            const imageUrl = buildImageUrl(combo.image_url);
            const label    = combo.title || combo.combo_name || combo.name || '';

            xml += urlEntry({
                loc: `${clientBase}/${combo.slug}`,
                lastmod,
                changefreq: 'weekly',
                priority: 0.8,
                images: imageUrl
                    ? [{ loc: imageUrl, caption: label, title: label }]
                    : [],
            });
        }

        xml += '\n</urlset>';

        setSitemapHeaders(res, 3600, 14400); // cache 1hr locally, 4hr at CDN
        res.send(xml);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /sitemap-blogs.xml
 * Individual blog post pages.
 * Includes:
 *   - <image:image> for cover images (boosts Google Image Search)
 *   - <lastmod> using published date (stable; re-crawled when updated)
 *
 * Priority:
 *   0.75 → Blog posts
 *   changefreq: monthly (content rarely changes after publish)
 */
router.get('/sitemap-blogs.xml', async (req, res, next) => {
    console.log('Sitemap Blogs Hit');
    try {
        const clientBase = getClientUrl();

        const { rows: blogs } = await pool.query(
            `SELECT slug, title, featured_image, image_alt, author, created_at, updated_at
             FROM blogs
             WHERE active = TRUE
             ORDER BY COALESCE(created_at, NOW()) DESC`
        );

        let xml = sitemapHeader();

        for (const blog of blogs) {
            if (!blog.slug) continue;
            // Use updated_at if available (re-crawl trigger), else published date
            const lastmod  = fmtDate(blog.updated_at || blog.created_at);
            const imageUrl = buildImageUrl(blog.featured_image);
            const label    = blog.title || '';
            const altText  = blog.image_alt || label;

            xml += urlEntry({
                loc: `${clientBase}/${blog.slug}`,
                lastmod,
                changefreq: 'monthly',
                priority: 0.75,
                images: imageUrl
                    ? [{ loc: imageUrl, caption: esc(altText), title: esc(label) }]
                    : [],
            });
        }

        xml += '\n</urlset>';

        setSitemapHeaders(res, 1800, 7200); // blogs update more often; shorter cache
        res.send(xml);
    } catch (err) {
        next(err);
    }
});

/**
 * GET /sitemap-pages.xml
 * Dynamic CMS pages (privacy policy, terms, visitor-guide content, etc.).
 * These pages are managed in the admin panel under cms_pages.
 *
 * Priority:
 *   0.65 → CMS pages (supplementary content)
 *   changefreq: monthly
 */
router.get('/sitemap-pages.xml', async (req, res, next) => {
    console.log('Sitemap CMS Pages Hit');
    try {
        const clientBase = getClientUrl();

        const { rows: pages } = await pool.query(
            `SELECT slug, title, updated_at, created_at
             FROM cms_pages
             WHERE active = TRUE
             ORDER BY nav_order ASC, COALESCE(updated_at, created_at) DESC`
        );

        let xml = sitemapHeader();

        for (const page of pages) {
            if (!page.slug) continue;
            const lastmod = fmtDate(page.updated_at || page.created_at);

            xml += urlEntry({
                loc: `${clientBase}/${page.slug}`,
                lastmod,
                changefreq: 'monthly',
                priority: 0.65,
            });
        }

        xml += '\n</urlset>';

        setSitemapHeaders(res, 3600, 86400); // static-ish; cache aggressively
        res.send(xml);
    } catch (err) {
        next(err);
    }
});


// ════════════════════════════════════════════════════════════════════════════
//  CATCH-ALL /:slug — Full SSR for search engine crawlers
// ════════════════════════════════════════════════════════════════════════════

/**
 * GET /:slug
 * Tries attraction → combo → blog → CMS page in order.
 * Returns full SEO HTML for crawlers (Googlebot, etc.).
 */
router.get('/:slug', async (req, res, next) => {
    console.log('SSR Catch-all Hit:', req.params.slug);
    try {
        const slug = String(req.params.slug || '').trim();
        // Skip static files (.xml, .txt, .ico, etc.) and empty slugs
        if (!slug || slug.includes('.')) return next();

        // 1. Try Attraction
        const attractionRes = await pool.query(
            `SELECT * FROM attractions WHERE active = TRUE AND LOWER(slug) = LOWER($1) ORDER BY sort_order ASC LIMIT 1`,
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
            `SELECT * FROM combos WHERE active = TRUE AND LOWER(slug) = LOWER($1) ORDER BY sort_order ASC LIMIT 1`,
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
                image: blog.featured_image || blog.image_url || '',
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

        // 4. Try CMS Page
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
