const blogService = require('../../services/blogService');

// GET /api/blogs?active=true&q=&page=&limit=
exports.listBlogs = async (req, res, next) => {
  try {
    const active =
      req.query.active === undefined ? true : String(req.query.active).toLowerCase() === 'true';
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    const { items, totalCount } = await blogService.list({ active, q, limit, offset });
    const totalPages = Math.ceil(totalCount / limit);

    res.json({
      data: items,
      meta: {
        totalCount,
        totalPages,
        page,
        limit,
        hasMore: page < totalPages
      }
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/blogs/:id
exports.getBlogById = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const data = await blogService.getById(id);
    res.json(data);
  } catch (err) {
    next(err);
  }
};

// GET /api/blogs/slug/:slug
exports.getBlogBySlug = async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').trim();
    const data = await blogService.getBySlug(slug);
    res.json(data);
  } catch (err) {
    next(err);
  }
};