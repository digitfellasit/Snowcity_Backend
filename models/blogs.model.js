const { pool } = require('../config/db');

function mapBlog(row) {
  if (!row) return null;
  let gallery = row.gallery;
  if (typeof gallery === 'string') {
    try {
      gallery = JSON.parse(gallery);
    } catch {
      gallery = [];
    }
  }
  let bulk_images = row.bulk_images;
  if (typeof bulk_images === 'string') {
    try {
      bulk_images = JSON.parse(bulk_images);
    } catch {
      bulk_images = [];
    }
  }
  if (Array.isArray(gallery)) {
    gallery = gallery.map((item) => {
      if (!item || typeof item !== 'object') {
        return { media_id: null, url: item }; // fallback for primitives
      }
      return {
        media_id: item.media_id ?? item.id ?? null,
        url: item.url ?? item.image_url ?? item.media_url ?? null,
        thumbnail: item.thumbnail ?? item.thumb_url ?? null,
        title: item.title ?? null,
        description: item.description ?? null,
      };
    });
  }
  if (Array.isArray(bulk_images)) {
    bulk_images = bulk_images.map((item) => {
      if (!item || typeof item !== 'object') {
        return { media_id: null, url: item }; // fallback for primitives
      }
      return {
        media_id: item.media_id ?? item.id ?? null,
        url: item.url ?? item.image_url ?? item.media_url ?? null,
        thumbnail: item.thumbnail ?? item.thumb_url ?? null,
        title: item.title ?? null,
        description: item.description ?? null,
      };
    });
  }
  // Normalize JSONB SEO fields
  let faq_items = row.faq_items;
  if (typeof faq_items === 'string') { try { faq_items = JSON.parse(faq_items); } catch { faq_items = []; } }
  if (!Array.isArray(faq_items)) faq_items = [];
  let head_schema = row.head_schema || '';
  let body_schema = row.body_schema || '';
  let footer_schema = row.footer_schema || '';

  return {
    blog_id: row.blog_id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    editor_mode: row.editor_mode,
    raw_html: row.raw_html,
    raw_css: row.raw_css,
    raw_js: row.raw_js,
    image_url: row.image_url,
    image_alt: row.image_alt,
    author: row.author,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    meta_keywords: row.meta_keywords,
    section_type: row.section_type,
    section_ref_id: row.section_ref_id,
    gallery,
    bulk_images,
    faq_items,
    head_schema,
    body_schema,
    footer_schema,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createBlog({ title, slug, content = null, image_url = null, image_alt = null, author = null, meta_title = null, meta_description = null, meta_keywords = null, section_type = 'none', section_ref_id = null, gallery = [], bulk_images = [], active = true, editor_mode = 'rich', raw_html = null, raw_css = null, raw_js = null, faq_items = [], head_schema = {}, body_schema = {}, footer_schema = {} }) {
  try {
    const faqPayload = Array.isArray(faq_items) ? JSON.stringify(faq_items) : (faq_items || '[]');
    const headSchemaPayload = head_schema || '';
    const bodySchemaPayload = body_schema || '';
    const footerSchemaPayload = footer_schema || '';
    const { rows } = await pool.query(
      `INSERT INTO blogs (title, slug, content, image_url, image_alt, author, meta_title, meta_description, meta_keywords, section_type, section_ref_id, gallery, bulk_images, active, editor_mode, raw_html, raw_css, raw_js, faq_items, head_schema, body_schema, footer_schema)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, COALESCE($12, '[]'::jsonb), COALESCE($13, '[]'::jsonb), $14, $15, $16, $17, $18, COALESCE($19, '[]'::jsonb), COALESCE($20, ''), COALESCE($21, ''), COALESCE($22, ''))
       RETURNING *`,
      [title, slug, content, image_url, image_alt, author, meta_title, meta_description, meta_keywords, section_type, section_ref_id, Array.isArray(gallery) ? JSON.stringify(gallery) : gallery, Array.isArray(bulk_images) ? JSON.stringify(bulk_images) : bulk_images, active, editor_mode, raw_html, raw_css, raw_js, faqPayload, headSchemaPayload, bodySchemaPayload, footerSchemaPayload]
    );
    return mapBlog(rows[0]);
  } catch (err) {
    // Fallback if schema lacks raw/editor columns
    if (err && (err.code === '42703' || /column\s+"?(editor_mode|raw_html|raw_css|raw_js|bulk_images)"?\s+does not exist/i.test(String(err.message)))) {
      const { rows } = await pool.query(
        `INSERT INTO blogs (title, slug, content, image_url, author, meta_title, meta_description, meta_keywords, section_type, section_ref_id, gallery, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, '[]'::jsonb), $12)
         RETURNING *`,
        [title, slug, content, image_url, author, meta_title, meta_description, meta_keywords, section_type, section_ref_id, Array.isArray(gallery) ? JSON.stringify(gallery) : gallery, active]
      );
      return mapBlog(rows[0]);
    }
    throw err;
  }
}

async function getBlogById(blog_id) {
  const { rows } = await pool.query(`SELECT * FROM blogs WHERE blog_id = $1`, [blog_id]);
  return mapBlog(rows[0]);
}

async function getBlogBySlug(slug) {
  const { rows } = await pool.query(`SELECT * FROM blogs WHERE slug = $1`, [slug]);
  return mapBlog(rows[0]);
}

async function listBlogs({ active = null, q = '', limit = 50, offset = 0, blogIds = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (active != null) {
    where.push(`active = $${i++}`);
    params.push(Boolean(active));
  }
  if (q) {
    where.push(`(title ILIKE $${i} OR slug ILIKE $${i} OR author ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  if (Array.isArray(blogIds) && blogIds.length) {
    where.push(`blog_id = ANY($${i}::bigint[])`);
    params.push(blogIds);
    i += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM blogs
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return rows.map(mapBlog);
}

async function updateBlog(blog_id, fields = {}) {
  const entries = Object.entries(fields).filter(([, v]) => v !== undefined);
  if (!entries.length) return getBlogById(blog_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v], idx) => {
    let val = v;
    if (['faq_items', 'gallery', 'bulk_images'].includes(k) && Array.isArray(val)) {
      val = JSON.stringify(val);
    }
    sets.push(`${k} = $${idx + 1}`);
    params.push(val);
  });
  params.push(blog_id);

  try {
    const { rows } = await pool.query(
      `UPDATE blogs SET ${sets.join(', ')}, updated_at = NOW()
       WHERE blog_id = $${params.length}
       RETURNING *`,
      params
    );
    return mapBlog(rows[0]);
  } catch (err) {
    // Fallback: if raw/editor columns don't exist, retry without them
    if (err && (err.code === '42703' || /column\s+"?(editor_mode|raw_html|raw_css|raw_js|bulk_images)"?\s+does not exist/i.test(String(err.message)))) {
      const filtered = entries.filter(([k]) => !['editor_mode', 'raw_html', 'raw_css', 'raw_js', 'bulk_images'].includes(k));
      if (!filtered.length) return getBlogById(blog_id);
      const sets2 = [];
      const params2 = [];
      filtered.forEach(([k, v], idx) => {
        sets2.push(`${k} = $${idx + 1}`);
        params2.push(v);
      });
      params2.push(blog_id);
      const { rows } = await pool.query(
        `UPDATE blogs SET ${sets2.join(', ')}, updated_at = NOW()
         WHERE blog_id = $${params2.length}
         RETURNING *`,
        params2
      );
      return mapBlog(rows[0]);
    }
    throw err;
  }
}

async function deleteBlog(blog_id) {
  const { rowCount } = await pool.query(`DELETE FROM blogs WHERE blog_id = $1`, [blog_id]);
  return rowCount > 0;
}

module.exports = {
  createBlog,
  getBlogById,
  getBlogBySlug,
  listBlogs,
  updateBlog,
  deleteBlog,
};