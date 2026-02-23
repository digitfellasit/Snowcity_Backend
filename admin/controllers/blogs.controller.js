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
      const data = await blogsModel.listBlogs({ active, q, limit, offset, blogIds: scopedIds });
      return res.json({ data, meta: { page, limit, count: data.length } });
    }

    const data = await blogsModel.listBlogs({ active, q, limit, offset });
    res.json({ data, meta: { page, limit, count: data.length } });
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
      title: p.title,
      slug: p.slug,
      content: p.content || null,
      image_url: p.image_url || null,
      author: p.author || null,
      active: p.active !== undefined ? !!p.active : true,
      meta_title: p.meta_title || null,
      meta_description: p.meta_description || null,
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
      head_schema: p.head_schema || {},
      body_schema: p.body_schema || {},
      footer_schema: p.footer_schema || {},
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
      title: p.title,
      slug: p.slug,
      content: p.content,
      image_url: p.image_url,
      author: p.author,
      active: p.active,
      meta_title: p.meta_title,
      meta_description: p.meta_description,
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
      title: p.title || '',
      slug: p.slug || '',
      content: p.content || null,
      image_url: p.image_url || null,
      author: p.author || null,
      meta_title: p.meta_title || null,
      meta_description: p.meta_description || null,
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
      head_schema: p.head_schema || {},
      body_schema: p.body_schema || {},
      footer_schema: p.footer_schema || {},
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