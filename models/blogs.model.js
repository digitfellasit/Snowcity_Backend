const { pool } = require('../config/db');
const { toCdn } = require('../utils/media');

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
        url: toCdn(item.url ?? item.image_url ?? item.media_url ?? null),
        thumbnail: toCdn(item.thumbnail ?? item.thumb_url ?? null),
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
        url: toCdn(item.url ?? item.image_url ?? item.media_url ?? null),
        thumbnail: toCdn(item.thumbnail ?? item.thumb_url ?? null),
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
    wp_id: row.wp_id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    excerpt: row.excerpt,
    editor_mode: row.editor_mode,
    raw_html: row.raw_html,
    raw_css: row.raw_css,
    raw_js: row.raw_js,
    featured_image: toCdn(row.featured_image_hydrated || row.featured_image),
    image_alt: row.image_alt,
    author: row.author,
    author_description: row.author_description,
    author_image_url: toCdn(row.author_image_url_hydrated || row.author_image_url),
    categories: row.categories || [],
    tags: row.tags || [],
    status: row.status,
    seo_title: row.seo_title,
    seo_description: row.seo_description,
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
    published_at: row.published_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createBlog({
  wp_id = null, title, slug, content = null, excerpt = null, featured_image = null, image_alt = null,
  author = null, author_image_url = null, author_description = null,
  categories = [], tags = [], status = 'publish',
  seo_title = null, seo_description = null, meta_keywords = null,
  section_type = 'none', section_ref_id = null, gallery = [], bulk_images = [],
  active = true, editor_mode = 'rich', raw_html = null, raw_css = null, raw_js = null,
  faq_items = [], head_schema = {}, body_schema = {}, footer_schema = {},
  published_at = null
}) {
  try {
    const faqPayload = Array.isArray(faq_items) ? JSON.stringify(faq_items) : (faq_items || '[]');
    const headSchemaPayload = head_schema || '';
    const bodySchemaPayload = body_schema || '';
    const footerSchemaPayload = footer_schema || '';
    const { rows } = await pool.query(
      `INSERT INTO blogs (
        wp_id, title, slug, content, excerpt, featured_image, image_alt, 
        author, author_description, author_image_url, 
        categories, tags, status,
        seo_title, seo_description, meta_keywords, 
        section_type, section_ref_id, gallery, bulk_images, 
        active, editor_mode, raw_html, raw_css, raw_js, 
        faq_items, head_schema, body_schema, footer_schema, 
        published_at
      )
       VALUES (
        $1, $2, $3, $4, $5, $6, $7, 
        $8, $9, $10, 
        $11, $12, $13,
        $14, $15, $16, 
        $17, $18, COALESCE($19, '[]'::jsonb), COALESCE($20, '[]'::jsonb), 
        $21, $22, $23, $24, $25, 
        COALESCE($26, '[]'::jsonb), COALESCE($27, ''), COALESCE($28, ''), COALESCE($29, ''),
        $30
      )
       RETURNING *`,
      [
        wp_id, title, slug, content, excerpt, featured_image, image_alt,
        author, author_description, author_image_url,
        categories, tags, status,
        seo_title, seo_description, meta_keywords,
        section_type, section_ref_id, Array.isArray(gallery) ? JSON.stringify(gallery) : gallery, Array.isArray(bulk_images) ? JSON.stringify(bulk_images) : bulk_images,
        active, editor_mode, raw_html, raw_css, raw_js,
        faqPayload, headSchemaPayload, bodySchemaPayload, footerSchemaPayload,
        published_at
      ]
    );
    return mapBlog(rows[0]);
  } catch (err) {
    throw err;
  }
}

async function getBlogById(blog_id) {
  const { rows } = await pool.query(
    `SELECT b.*, 
            mf.url_path AS featured_image_hydrated,
            ma.url_path AS author_image_url_hydrated
     FROM blogs b
     LEFT JOIN media_files mf ON mf.media_id = (CASE WHEN b.featured_image ~ '^[0-9]+$' THEN b.featured_image::bigint ELSE NULL END)
     LEFT JOIN media_files ma ON ma.media_id = (CASE WHEN b.author_image_url ~ '^[0-9]+$' THEN b.author_image_url::bigint ELSE NULL END)
     WHERE b.blog_id = $1`, 
    [blog_id]
  );
  return mapBlog(rows[0]);
}

async function getBlogBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT b.*, 
            mf.url_path AS featured_image_hydrated,
            ma.url_path AS author_image_url_hydrated
     FROM blogs b
     LEFT JOIN media_files mf ON mf.media_id = (CASE WHEN b.featured_image ~ '^[0-9]+$' THEN b.featured_image::bigint ELSE NULL END)
     LEFT JOIN media_files ma ON ma.media_id = (CASE WHEN b.author_image_url ~ '^[0-9]+$' THEN b.author_image_url::bigint ELSE NULL END)
     WHERE b.slug = $1`, 
    [slug]
  );
  return mapBlog(rows[0]);
}

async function listBlogs({ active = null, q = '', limit = 50, offset = 0, blogIds = null, includeContent = false } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (active != null) {
    where.push(`b.active = $${i++}`);
    params.push(Boolean(active));
  }
  if (q) {
    where.push(`(b.title ILIKE $${i} OR b.slug ILIKE $${i} OR b.author ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  if (Array.isArray(blogIds) && blogIds.length) {
    where.push(`b.blog_id = ANY($${i}::bigint[])`);
    params.push(blogIds);
    i += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  // Use lightweight columns for list views, full columns only when content is needed
  const columns = includeContent
    ? 'b.*, COUNT(*) OVER() as total_count'
    : `b.blog_id, b.title, b.slug, b.excerpt, b.featured_image, b.image_alt, b.author,
       b.author_image_url, b.categories, b.tags, b.status, b.active,
       b.published_at, b.created_at, b.updated_at, COUNT(*) OVER() as total_count`;

  const { rows } = await pool.query(
    `SELECT ${columns}, 
            mf.url_path AS featured_image_hydrated,
            ma.url_path AS author_image_url_hydrated
     FROM blogs b
     LEFT JOIN media_files mf ON mf.media_id = (CASE WHEN b.featured_image ~ '^[0-9]+$' THEN b.featured_image::bigint ELSE NULL END)
     LEFT JOIN media_files ma ON ma.media_id = (CASE WHEN b.author_image_url ~ '^[0-9]+$' THEN b.author_image_url::bigint ELSE NULL END)
     ${whereSql}
     ORDER BY COALESCE(b.published_at, b.created_at) DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  const totalCount = rows.length > 0 ? parseInt(rows[0].total_count, 10) : 0;
  return { items: rows.map(mapBlog), totalCount };
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

  const { rows } = await pool.query(
    `UPDATE blogs SET ${sets.join(', ')}, updated_at = NOW()
     WHERE blog_id = $${params.length}
     RETURNING *`,
    params
  );
  return mapBlog(rows[0]);
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