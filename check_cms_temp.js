const { pool } = require('./config/db');

async function main() {
  try {
    const { rows } = await pool.query(`
      SELECT page_id, title, slug, placement, placement_ref_id, section_type, section_ref_id,
             editor_mode, active,
             LENGTH(content) as content_len,
             LENGTH(raw_html) as raw_html_len,
             SUBSTRING(content, 1, 200) as content_preview
      FROM cms_pages
      ORDER BY page_id
    `);
    console.log('=== All CMS Pages ===');
    rows.forEach(r => {
      console.log(`ID: ${r.page_id} | Title: "${r.title}" | Slug: "${r.slug}" | Placement: ${r.placement} | Editor: ${r.editor_mode} | Active: ${r.active} | Content Len: ${r.content_len} | Raw HTML Len: ${r.raw_html_len}`);
      if (r.content_preview) console.log(`  Content Preview: ${r.content_preview.substring(0, 150)}...`);
      console.log('---');
    });
    
    // Check what the user API returns
    const { rows: moreInfoPages } = await pool.query(`
      SELECT page_id, title, slug, placement, section_type, section_ref_id, editor_mode, 
             content, raw_html, raw_css, raw_js
      FROM cms_pages 
      WHERE placement = 'more_info' AND active = true
    `);
    console.log('\n=== More Info Pages (full detail) ===');
    moreInfoPages.forEach(r => {
      console.log(`ID: ${r.page_id} | Title: "${r.title}" | Editor: ${r.editor_mode}`);
      console.log(`  Content: ${(r.content || '').substring(0, 300)}`);
      console.log(`  Raw HTML: ${(r.raw_html || '').substring(0, 300)}`);
      console.log('---');
    });
    
  } catch (err) {
    console.error('DB Error:', err.message);
  } finally {
    await pool.end();
  }
}
main();
