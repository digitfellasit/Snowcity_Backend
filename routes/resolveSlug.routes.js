// routes/resolveSlug.routes.js
const router = require('express').Router();
const attractionsModel = require('../models/attractions.model');
const blogsModel = require('../models/blogs.model');
const cmsPagesModel = require('../models/cmsPages.model');
const combosModel = require('../models/combos.model');

/**
 * GET /api/resolve-slug/:slug
 * Identifies the content type for a given root-level slug.
 */
router.get('/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug || '').trim();
        if (!slug) return res.status(400).json({ error: 'slug required' });

        // 1. Try Attraction
        const attr = await attractionsModel.getAttractionBySlug(slug);
        if (attr) {
            return res.json({ type: 'attraction', id: attr.attraction_id, data: attr });
        }

        // 2. Try Blog
        const blog = await blogsModel.getBlogBySlug(slug);
        if (blog) {
            return res.json({ type: 'blog', id: blog.blog_id, data: blog });
        }

        // 3. Try CMS Page
        const page = await cmsPagesModel.getPageBySlug(slug);
        if (page) {
            return res.json({ type: 'page', id: page.page_id, data: page });
        }

        // 4. Try Combo
        const combo = await combosModel.getComboBySlug(slug);
        if (combo) {
            return res.json({ type: 'combo', id: combo.combo_id, data: combo });
        }

        res.status(404).json({ type: 'not_found', message: 'No content found for this slug' });
    } catch (err) {
        next(err);
    }
});

module.exports = router;
