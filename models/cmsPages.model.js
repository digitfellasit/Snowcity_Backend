const { pool } = require('../config/db');

function normalizeGallery(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function normalizeBulkImages(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function mapPage(row) {
  if (!row) return null;
  // Normalize JSONB SEO fields
  let faq_items = row.faq_items;
  if (typeof faq_items === 'string') { try { faq_items = JSON.parse(faq_items); } catch { faq_items = []; } }
  if (!Array.isArray(faq_items)) faq_items = [];
  let head_schema = row.head_schema;
  if (typeof head_schema === 'string') { try { head_schema = JSON.parse(head_schema); } catch { head_schema = {}; } }
  let body_schema = row.body_schema;
  if (typeof body_schema === 'string') { try { body_schema = JSON.parse(body_schema); } catch { body_schema = {}; } }
  let footer_schema = row.footer_schema;
  if (typeof footer_schema === 'string') { try { footer_schema = JSON.parse(footer_schema); } catch { footer_schema = {}; } }

  return {
    page_id: row.page_id,
    title: row.title,
    slug: row.slug,
    content: row.content,
    image_url: row.image_url || row.hero_image || null,
    image_alt: row.image_alt || row.hero_image_alt || null,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    meta_keywords: row.meta_keywords,
    section_type: row.section_type,
    section_ref_id: row.section_ref_id,
    gallery: normalizeGallery(row.gallery),
    bulk_images: normalizeBulkImages(row.bulk_images),
    editor_mode: row.editor_mode || 'rich',
    raw_html: row.raw_html || null,
    raw_css: row.raw_css || null,
    raw_js: row.raw_js || null,
    nav_group: row.nav_group || null,
    nav_order: Number.isFinite(row.nav_order) ? Number(row.nav_order) : 0,
    placement: row.placement || 'none',
    placement_ref_id: row.placement_ref_id,
    faq_items,
    head_schema,
    body_schema,
    footer_schema,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function createPage({
  title,
  slug,
  content,
  image_url = null,
  hero_image = null,
  image_alt = null,
  hero_image_alt = null,
  meta_title = null,
  meta_description = null,
  meta_keywords = null,
  section_type = 'none',
  section_ref_id = null,
  gallery = [],
  bulk_images = [],
  active = true,
  editor_mode = 'rich',
  raw_html = null,
  raw_css = null,
  raw_js = null,
  nav_group = null,
  nav_order = 0,
  placement = 'none',
  faq_items = [],
  head_schema = {},
  body_schema = {},
  footer_schema = {},
  placement_ref_id = null,
}) {
  const hero = hero_image || image_url || null;
  const heroAlt = hero_image_alt || image_alt || null;
  const galleryPayload = Array.isArray(gallery) ? JSON.stringify(gallery) : gallery;
  const bulkImagesPayload = Array.isArray(bulk_images) ? JSON.stringify(bulk_images) : bulk_images;
  const navOrder = Number.isFinite(Number(nav_order)) ? Number(nav_order) : 0;
  const faqPayload = Array.isArray(faq_items) ? JSON.stringify(faq_items) : (faq_items || '[]');
  const headSchemaPayload = typeof head_schema === 'object' ? JSON.stringify(head_schema) : (head_schema || '{}');
  const bodySchemaPayload = typeof body_schema === 'object' ? JSON.stringify(body_schema) : (body_schema || '{}');
  const footerSchemaPayload = typeof footer_schema === 'object' ? JSON.stringify(footer_schema) : (footer_schema || '{}');
  try {
    const { rows } = await pool.query(
      `INSERT INTO cms_pages (
        title, slug, content, hero_image, hero_image_alt,
        meta_title, meta_description, meta_keywords,
        section_type, section_ref_id, gallery, bulk_images, active,
        nav_group, nav_order, placement, placement_ref_id,
        editor_mode, raw_html, raw_css, raw_js,
        faq_items, head_schema, body_schema, footer_schema
      )
       VALUES (
        $1, $2, $3, $4, $25,
        $5, $6, $7,
        $8, $9, COALESCE($10, '[]'::jsonb), COALESCE($11, '[]'::jsonb), $12,
        $13, $14, $15, $16,
        $17, $18, $19, $20,
        COALESCE($21, '[]'::jsonb), COALESCE($22, '{}'::jsonb), COALESCE($23, '{}'::jsonb), COALESCE($24, '{}'::jsonb)
      )
       RETURNING *`,
      [
        title,
        slug,
        content,
        hero,
        meta_title,
        meta_description,
        meta_keywords,
        section_type,
        section_ref_id,
        galleryPayload,
        bulkImagesPayload,
        active,
        nav_group,
        navOrder,
        placement,
        placement_ref_id,
        editor_mode,
        raw_html,
        raw_css,
        raw_js,
        faqPayload,
        headSchemaPayload,
        bodySchemaPayload,
        footerSchemaPayload,
        heroAlt,
      ]
    );
    return mapPage(rows[0]);
  } catch (err) {
    const missingColumn = err && (err.code === '42703' || /column\s+"?(hero_image|nav_group|nav_order|placement|placement_ref_id|editor_mode|raw_html|raw_css|raw_js|bulk_images)"?\s+does not exist/i.test(String(err.message)));
    if (missingColumn) {
      const { rows } = await pool.query(
        `INSERT INTO cms_pages (
          title, slug, content,
          meta_title, meta_description, meta_keywords,
          section_type, section_ref_id, gallery, active
        )
         VALUES (
          $1, $2, $3,
          $4, $5, $6,
          $7, $8, COALESCE($9, '[]'::jsonb), $10
        )
         RETURNING *`,
        [title, slug, content, meta_title, meta_description, meta_keywords, section_type, section_ref_id, galleryPayload, active]
      );
      return mapPage(rows[0]);
    }
    throw err;
  }
}

async function getPageById(page_id) {
  const { rows } = await pool.query(`SELECT * FROM cms_pages WHERE page_id = $1`, [page_id]);
  return mapPage(rows[0]);
}

async function getPageBySlug(slug) {
  const { rows } = await pool.query(`SELECT * FROM cms_pages WHERE slug = $1`, [slug]);
  return mapPage(rows[0]);
}

async function listPages({ active = null, q = '', limit = 50, offset = 0, pageIds = null } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (active != null) {
    where.push(`active = $${i++}`);
    params.push(Boolean(active));
  }
  if (q) {
    where.push(`(title ILIKE $${i} OR slug ILIKE $${i})`);
    params.push(`%${q}%`);
    i += 1;
  }
  if (Array.isArray(pageIds) && pageIds.length) {
    where.push(`page_id = ANY($${i}::bigint[])`);
    params.push(pageIds);
    i += 1;
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const { rows } = await pool.query(
    `SELECT * FROM cms_pages
     ${whereSql}
     ORDER BY created_at DESC
     LIMIT $${i} OFFSET $${i + 1}`,
    [...params, limit, offset]
  );
  return rows.map(mapPage);
}

async function updatePage(page_id, fields = {}) {
  const input = { ...fields };
  // Normalize hero image: accept image_url from API but store in hero_image
  if (Object.prototype.hasOwnProperty.call(input, 'image_url')) {
    if (!Object.prototype.hasOwnProperty.call(input, 'hero_image')) {
      input.hero_image = input.image_url;
    }
    delete input.image_url;
  }

  if (Object.prototype.hasOwnProperty.call(input, 'nav_order')) {
    const navOrder = Number.isFinite(Number(input.nav_order)) ? Number(input.nav_order) : 0;
    input.nav_order = navOrder;
  }

  // Whitelist allowed columns to avoid "column does not exist" errors
  const allowed = new Set([
    'title', 'slug', 'content', 'meta_title', 'meta_description', 'meta_keywords',
    'section_type', 'section_ref_id', 'gallery', 'bulk_images', 'active', 'hero_image', 'hero_image_alt',
    'nav_group', 'nav_order', 'placement', 'placement_ref_id',
    'editor_mode', 'raw_html', 'raw_css', 'raw_js',
    'faq_items', 'head_schema', 'body_schema', 'footer_schema'
  ]);

  const entries = Object.entries(input).filter(([k, v]) => allowed.has(k) && v !== undefined);
  if (!entries.length) return getPageById(page_id);

  const sets = [];
  const params = [];
  entries.forEach(([k, v]) => {
    let val = v;
    if ((k === 'gallery' || k === 'bulk_images' || k === 'faq_items') && Array.isArray(val)) {
      val = JSON.stringify(val);
    }
    if ((k === 'head_schema' || k === 'body_schema' || k === 'footer_schema') && typeof val === 'object' && val !== null) {
      val = JSON.stringify(val);
    }
    sets.push(`${k} = $${params.length + 1}`);
    params.push(val);
  });
  params.push(page_id);

  try {
    const { rows } = await pool.query(
      `UPDATE cms_pages SET ${sets.join(', ')}, updated_at = NOW()
       WHERE page_id = $${params.length}
       RETURNING *`,
      params
    );
    return mapPage(rows[0]);
  } catch (err) {
    // Fallback if extended columns do not exist in current schema
    if (err && (err.code === '42703' || /column\s+"?(hero_image|nav_group|nav_order|placement|placement_ref_id|editor_mode|raw_html|raw_css|raw_js|bulk_images)"?\s+does not exist/i.test(String(err.message)))) {
      const noExtendedEntries = entries.filter(([k]) => !['hero_image', 'nav_group', 'nav_order', 'placement', 'placement_ref_id', 'editor_mode', 'raw_html', 'raw_css', 'raw_js', 'bulk_images'].includes(k));
      if (!noExtendedEntries.length) return getPageById(page_id);
      const sets2 = [];
      const params2 = [];
      noExtendedEntries.forEach(([k, v]) => {
        let val = v;
        if (k === 'gallery' && Array.isArray(val)) val = JSON.stringify(val);
        sets2.push(`${k} = $${params2.length + 1}`);
        params2.push(val);
      });
      params2.push(page_id);
      const { rows } = await pool.query(
        `UPDATE cms_pages SET ${sets2.join(', ')}, updated_at = NOW()
         WHERE page_id = $${params2.length}
         RETURNING *`,
        params2
      );
      return mapPage(rows[0]);
    }
    throw err;
  }
}

async function deletePage(page_id) {
  const { rowCount } = await pool.query(`DELETE FROM cms_pages WHERE page_id = $1`, [page_id]);
  return rowCount > 0;
}

module.exports = {
  createPage,
  getPageById,
  getPageBySlug,
  listPages,
  updatePage,
  deletePage,
};