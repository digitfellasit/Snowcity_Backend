// admin/controllers/blogs.controller.js
const blogsModel = require('../../models/blogs.model');
const blogService = require('../../services/blogService');
const { buildScopeFilter } = require('../middleware/scopedAccess');

// List blogs with filters/pagination
async function listBlogs(req, res, next) {
  try {
    const active =
      req.query.active === undefined ? null : String(req.query.active).toLowerCase() === 'true';
    const q = (req.query.q || '').toString().trim();
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit || '20', 10), 1), 100);
    const offset = (page - 1) * limit;

    // Scope: only return blogs this admin can access
    const scopes = req.user.scopes || {};
    const blogScope = scopes.blog || [];
    if (!blogScope.includes('*')) {
      // If no full access, enforce list filter
      const scopedIds = blogScope.length ? blogScope : [null];
      const { items, totalCount } = await blogsModel.listBlogs({ active, q, limit, offset, blogIds: scopedIds });
      return res.json({ data: items, meta: { page, limit, totalCount } });
    }

    const { items, totalCount } = await blogsModel.listBlogs({ active, q, limit, offset });
    res.json({ data: items, meta: { page, limit, totalCount } });
  } catch (err) {
    next(err);
  }
}

// Get single blog
async function getBlogById(req, res, next) {
  try {
    const id = Number(req.params.id);
    const scopes = req.user.scopes || {};
    const blogScope = scopes.blog || [];
    if (blogScope.length && !blogScope.includes('*') && !blogScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: blog not in scope' });
    }
    const row = await blogsModel.getBlogById(id);
    if (!row) return res.status(404).json({ error: 'Blog not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

// Create blog (supports rich or raw editor)
async function createBlog(req, res, next) {
  try {
    // Scope: only admins with full blog module access can create
    const scopes = req.user.scopes || {};
    const blogScope = scopes.blog || [];
    if (!blogScope.includes('*')) {
      return res.status(403).json({ error: 'Forbidden: requires full blog module access' });
    }
    const p = req.body || {};
    const payload = {
      wp_id: p.wp_id || null,
      title: p.title,
      slug: p.slug,
      content: p.content || null,
      excerpt: p.excerpt || null,
      featured_image: p.featured_image || null,
      image_alt: p.image_alt || null,
      author: p.author || null,
      author_image_url: p.author_image_url || null,
      author_description: p.author_description || null,
      active: p.active !== undefined ? !!p.active : true,
      categories: Array.isArray(p.categories) ? p.categories : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: p.status || 'publish',
      seo_title: p.seo_title || null,
      seo_description: p.seo_description || null,
      meta_keywords: p.meta_keywords || null,
      section_type: p.section_type || 'none',
      section_ref_id: p.section_ref_id || null,
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      bulk_images: Array.isArray(p.bulk_images) ? p.bulk_images : [],
      editor_mode: p.editor_mode || 'rich', // 'rich' | 'raw'
      raw_html: p.raw_html || null,
      raw_css: p.raw_css || null,
      raw_js: p.raw_js || null,
      faq_items: Array.isArray(p.faq_items) ? p.faq_items : [],
      head_schema: p.head_schema || '',
      body_schema: p.body_schema || '',
      footer_schema: p.footer_schema || '',
      published_at: p.published_at || null,
    };
    const row = await blogService.createBlog(payload);
    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

// Update blog
async function updateBlog(req, res, next) {
  try {
    const id = Number(req.params.id);
    const scopes = req.user.scopes || {};
    const blogScope = scopes.blog || [];
    if (blogScope.length && !blogScope.includes('*') && !blogScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: blog not in scope' });
    }
    const p = req.body || {};
    const payload = {
      wp_id: p.wp_id,
      title: p.title,
      slug: p.slug,
      content: p.content,
      excerpt: p.excerpt,
      featured_image: p.featured_image,
      image_alt: p.image_alt,
      author: p.author,
      author_image_url: p.author_image_url,
      author_description: p.author_description,
      active: p.active,
      categories: Array.isArray(p.categories) ? p.categories : undefined,
      tags: Array.isArray(p.tags) ? p.tags : undefined,
      status: p.status,
      seo_title: p.seo_title,
      seo_description: p.seo_description,
      meta_keywords: p.meta_keywords,
      section_type: p.section_type,
      section_ref_id: p.section_ref_id,
      gallery: Array.isArray(p.gallery) ? p.gallery : undefined,
      bulk_images: Array.isArray(p.bulk_images) ? p.bulk_images : undefined,
      editor_mode: p.editor_mode,
      raw_html: p.raw_html,
      raw_css: p.raw_css,
      raw_js: p.raw_js,
      faq_items: Array.isArray(p.faq_items) ? p.faq_items : undefined,
      head_schema: p.head_schema,
      body_schema: p.body_schema,
      footer_schema: p.footer_schema,
      published_at: p.published_at,
    };
    const row = await blogService.updateBlog(id, payload);
    if (!row) return res.status(404).json({ error: 'Blog not found' });
    res.json(row);
  } catch (err) {
    next(err);
  }
}

// Delete blog
async function deleteBlog(req, res, next) {
  try {
    const id = Number(req.params.id);
    const scopes = req.user.scopes || {};
    const blogScope = scopes.blog || [];
    if (blogScope.length && !blogScope.includes('*') && !blogScope.includes(id)) {
      return res.status(403).json({ error: 'Forbidden: blog not in scope' });
    }
    const ok = await blogsModel.deleteBlog(id);
    if (!ok) return res.status(404).json({ error: 'Blog not found' });
    res.json({ deleted: true });
  } catch (err) {
    next(err);
  }
}

// Preview (no persistence)
async function previewBlog(req, res, next) {
  try {
    const p = req.body || {};
    const out = {
      wp_id: p.wp_id || null,
      title: p.title || '',
      slug: p.slug || '',
      content: p.content || null,
      excerpt: p.excerpt || null,
      featured_image: p.featured_image || null,
      image_alt: p.image_alt || null,
      author: p.author || null,
      author_image_url: p.author_image_url || null,
      author_description: p.author_description || null,
      categories: Array.isArray(p.categories) ? p.categories : [],
      tags: Array.isArray(p.tags) ? p.tags : [],
      status: p.status || 'publish',
      seo_title: p.seo_title || null,
      seo_description: p.seo_description || null,
      meta_keywords: p.meta_keywords || null,
      section_type: p.section_type || 'none',
      section_ref_id: p.section_ref_id || null,
      gallery: Array.isArray(p.gallery) ? p.gallery : [],
      bulk_images: Array.isArray(p.bulk_images) ? p.bulk_images : [],
      active: p.active !== undefined ? !!p.active : true,
      editor_mode: p.editor_mode || 'rich',
      raw_html: p.raw_html || '',
      raw_css: p.raw_css || '',
      raw_js: p.raw_js || '',
      faq_items: Array.isArray(p.faq_items) ? p.faq_items : [],
      head_schema: p.head_schema || '',
      body_schema: p.body_schema || '',
      footer_schema: p.footer_schema || '',
      published_at: p.published_at || null,
      preview: true,
    };
    res.json(out);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listBlogs,
  getBlogById,
  createBlog,
  updateBlog,
  deleteBlog,
  previewBlog,
};