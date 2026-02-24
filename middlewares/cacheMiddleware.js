/**
 * Cache middleware for public API routes.
 * Sets Cache-Control headers to reduce repeated fetches
 * and improve PageSpeed "Use efficient cache lifetimes" score.
 *
 * Usage: router.get('/endpoint', cachePublic(300), handler)
 *
 * @param {number} maxAgeSec  - Browser cache duration in seconds (default 300 = 5 min)
 * @param {number} sMaxAgeSec - CDN/proxy cache duration in seconds (default 2× maxAgeSec)
 */
function cachePublic(maxAgeSec = 300, sMaxAgeSec) {
    const sMax = sMaxAgeSec || maxAgeSec * 2;
    return (req, res, next) => {
        // Only cache GET requests
        if (req.method !== 'GET') return next();
        res.set('Cache-Control', `public, max-age=${maxAgeSec}, s-maxage=${sMax}, stale-while-revalidate=${maxAgeSec}`);
        next();
    };
}

/**
 * Immutable cache for static assets (images/uploads).
 * 1 year cache with immutable hint.
 */
function cacheImmutable() {
    return (req, res, next) => {
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        next();
    };
}

module.exports = { cachePublic, cacheImmutable };
