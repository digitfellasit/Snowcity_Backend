// routes/resolveSlug.routes.js
const router = require('express').Router();
const attractionsModel = require('../models/attractions.model');
const blogsModel = require('../models/blogs.model');
const cmsPagesModel = require('../models/cmsPages.model');
const combosModel = require('../models/combos.model');
const logger = require('../config/logger');

/**
 * GET /api/resolve-slug/:slug
 * Identifies the content type for a given root-level slug.
 */
router.get('/:slug', async (req, res, next) => {
    try {
        const slug = String(req.params.slug || '').trim();
        logger.info('[SlugResolver] Resolving: %s', slug);
        if (!slug) return res.status(400).json({ error: 'slug required' });

        // 1. Try Attraction
        const attr = await attractionsModel.getAttractionBySlug(slug);
        if (attr) {
            logger.info('[SlugResolver] Found Attraction: %s', attr.attraction_id);
            return res.json({ type: 'attraction', id: attr.attraction_id, data: attr });
        }

        // 2. Try Blog
        const blog = await blogsModel.getBlogBySlug(slug);
        if (blog) {
            logger.info('[SlugResolver] Found Blog: %s', blog.blog_id);
            return res.json({ type: 'blog', id: blog.blog_id, data: blog });
        }

        // 3. Try CMS Page
        const page = await cmsPagesModel.getPageBySlug(slug);
        if (page) {
            logger.info('[SlugResolver] Found Page: %s', page.page_id);
            return res.json({ type: 'page', id: page.page_id, data: page });
        }

        // 4. Try Combo
        logger.info('[SlugResolver] Checking Combo for: %s', slug);
        let combo = await combosModel.getComboBySlug(slug);
        if (!combo && slug.startsWith('combo-')) {
            const stripped = slug.substring(6);
            logger.info('[SlugResolver] Checking Combo (stripped): %s', stripped);
            combo = await combosModel.getComboBySlug(stripped);
        }
        if (combo) {
            logger.info('[SlugResolver] Found Combo: %s', combo.combo_id);
            return res.json({ type: 'combo', id: combo.combo_id, data: combo });
        }

        logger.info('[SlugResolver] Not found: %s', slug);
        res.status(404).json({ type: 'not_found', message: 'No content found for this slug' });
    } catch (err) {
        logger.error('[SlugResolver] Error: %s', err.message);
        next(err);
    }
});

module.exports = router;
