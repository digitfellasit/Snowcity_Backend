const { pool } = require('../config/db');

/**
 * List all page_seo entries (ordered by slug)
 */
async function listPageSeo() {
  const { rows } = await pool.query(
    `SELECT * FROM page_seo ORDER BY CASE WHEN slug = 'default' THEN 0 ELSE 1 END, slug ASC`
  );
  return rows;
}

/**
 * Get page_seo by slug
 */
async function getPageSeoBySlug(slug) {
  const { rows } = await pool.query(
    `SELECT * FROM page_seo WHERE slug = $1`, [slug]
  );
  return rows[0] || null;
}

/**
 * Upsert a page_seo entry (insert or update)
 */
async function upsertPageSeo({ slug, meta_title, meta_description }) {
  const { rows } = await pool.query(
    `INSERT INTO page_seo (slug, meta_title, meta_description)
     VALUES ($1, $2, $3)
     ON CONFLICT (slug)
     DO UPDATE SET meta_title = $2, meta_description = $3, updated_at = NOW()
     RETURNING *`,
    [slug, meta_title || null, meta_description || null]
  );
  return rows[0];
}

/**
 * Delete a page_seo entry by id (prevent deleting 'default')
 */
async function deletePageSeo(id) {
  const { rowCount } = await pool.query(
    `DELETE FROM page_seo WHERE id = $1 AND slug != 'default'`, [id]
  );
  return rowCount > 0;
}

module.exports = { listPageSeo, getPageSeoBySlug, upsertPageSeo, deletePageSeo };
