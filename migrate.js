/**
 * WordPress → PostgreSQL Blog Migration Script
 * 
 * SETUP:
 *   npm install pg node-fetch cheerio dotenv
 * 
 * USAGE:
 *   node migrate.js              # dry run (no DB writes)
 *   node migrate.js --import     # fetch + insert into PostgreSQL
 *   node migrate.js --page=3     # start from a specific page
 */

require('dotenv').config();
const { Client } = require('pg');

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const WP_BASE_URL = process.env.WP_BASE_URL || 'https://your-wordpress-site.com';
const PER_PAGE = 20;   // WordPress max is 100
const DRY_RUN = !process.argv.includes('--import');
const START_PAGE = parseInt((process.argv.find(a => a.startsWith('--page=')) || '--page=1').split('=')[1]);

const isTrue = (v) => ['1', 'true', 'yes', 'on'].includes(String(v || '').toLowerCase());
const dbConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: ((process.env.PGSSLMODE && process.env.PGSSLMODE !== 'disable') ||
    isTrue(process.env.PGSSL) ||
    /amazonaws\.com/i.test(process.env.DATABASE_URL || ''))
    ? { rejectUnauthorized: false }
    : false,
};

// ─── WORDPRESS FETCHER ────────────────────────────────────────────────────────

async function fetchPosts(page = 1) {
  const url = `${WP_BASE_URL}/wp-json/wp/v2/posts?per_page=${PER_PAGE}&page=${page}&_embed=1&status=publish`;
  console.log(`\n📥 Fetching page ${page}: ${url}`);

  const res = await fetch(url);

  if (!res.ok) {
    if (res.status === 400) return { posts: [], totalPages: 0 }; // no more pages
    throw new Error(`WP API error: ${res.status} ${res.statusText}`);
  }

  const totalPages = parseInt(res.headers.get('X-WP-TotalPages') || '1');
  const posts = await res.json();
  return { posts, totalPages };
}

async function fetchCategories() {
  const res = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/categories?per_page=100`);
  if (!res.ok) return {};
  const cats = await res.json();
  return Object.fromEntries(cats.map(c => [c.id, c.name]));
}

async function fetchTags() {
  const res = await fetch(`${WP_BASE_URL}/wp-json/wp/v2/tags?per_page=100`);
  if (!res.ok) return {};
  const tags = await res.json();
  return Object.fromEntries(tags.map(t => [t.id, t.name]));
}

// ─── CONTENT CONVERTER ───────────────────────────────────────────────────────

/**
 * Converts WordPress Gutenberg block HTML to clean HTML
 * suitable for a rich text editor (TipTap, Quill, Slate, etc.)
 */
function convertBlocksToHTML(rawHTML) {
  if (!rawHTML) return '';

  let html = rawHTML;

  // 1. Remove Gutenberg block comments <!-- wp:xxx --> ... <!-- /wp:xxx -->
  html = html.replace(/<!-- wp:[^\n]* -->/g, '');
  html = html.replace(/<!-- \/wp:[a-z/-]+ -->/g, '');

  // 2. Unwrap figure wrappers around images (keep the <img>)
  html = html.replace(/<figure[^>]*>\s*(<img[^>]*>)\s*(?:<figcaption[^>]*>.*?<\/figcaption>)?\s*<\/figure>/gis, '$1');

  // 3. Clean up WordPress-specific classes
  html = html.replace(/\s?class="[^"]*wp-[^"]*"/g, '');
  html = html.replace(/\s?class="[^"]*aligncenter[^"]*"/g, '');
  html = html.replace(/\s?class="[^"]*alignwide[^"]*"/g, '');
  html = html.replace(/\s?class="[^"]*has-[^"]*"/g, '');

  // 4. Remove inline styles added by Gutenberg
  html = html.replace(/\s?style="[^"]*"/g, '');

  // 5. Clean up empty attributes and normalize self-closing tags
  html = html.replace(/ class=""/g, '');
  html = html.replace(/<img([^>]*)>/g, '<img$1 />');

  // 6. Collapse multiple blank lines
  html = html.replace(/\n{3,}/g, '\n\n');

  // 7. Trim
  html = html.trim();

  return html;
}

// ─── POST MAPPER ─────────────────────────────────────────────────────────────

function mapPost(wpPost, categoryMap, tagMap) {
  const embed = wpPost._embedded || {};

  // Featured image
  const featuredMedia = embed['wp:featuredmedia']?.[0];
  const featuredImageUrl = featuredMedia?.source_url || null;

  // Author
  let author = embed?.author?.[0];
  let authorName = author?.name;
  let authorDescription = author?.description;

  // Fallback to Yoast schema for Author info if missing/invalid in embed
  if (!authorName || authorName === 'Unknown' || (author && author.code === 'rest_user_invalid_id')) {
    const person = wpPost.yoast_head_json?.schema?.['@graph']?.find(item => item['@type'] === 'Person');
    if (person) {
      authorName = person.name;
      authorDescription = person.description || authorDescription;
    }
  }

  // Categories & Tags
  const categoryIds = wpPost.categories || [];
  const tagIds = wpPost.tags || [];
  const categoryNames = categoryIds.map(id => categoryMap[id]).filter(Boolean);
  const tagNames = tagIds.map(id => tagMap[id]).filter(Boolean);

  // Content conversion
  const rawHTML = wpPost.content?.rendered || '';
  const cleanHTML = convertBlocksToHTML(rawHTML);

  return {
    wp_id: wpPost.id,
    title: wpPost.title?.rendered || '',
    slug: wpPost.slug,
    content: cleanHTML,
    excerpt: stripHTML(wpPost.excerpt?.rendered || ''),
    featured_image: featuredImageUrl,
    author: authorName || 'Unknown',
    author_description: authorDescription || '',
    categories: categoryNames,
    tags: tagNames,
    status: wpPost.status,        // 'publish'
    seo_title: wpPost.yoast_head_json?.title || wpPost.title?.rendered || '',
    seo_description: wpPost.yoast_head_json?.description || wpPost.yoast_head_json?.og_description || '',
    published_at: new Date(wpPost.date_gmt),
    updated_at: new Date(wpPost.modified_gmt),
  };
}

function stripHTML(html) {
  return html.replace(/<[^>]*>/g, '').trim();
}

// ─── DATABASE ─────────────────────────────────────────────────────────────────

async function ensureTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS blogs (
      blog_id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      wp_id              INTEGER UNIQUE,
      title              TEXT NOT NULL,
      slug               VARCHAR(500) UNIQUE NOT NULL,
      content            TEXT,
      excerpt            TEXT,
      featured_image     TEXT,
      author             VARCHAR(255),
      author_description TEXT,
      categories         TEXT[],
      tags               TEXT[],
      status             VARCHAR(50) DEFAULT 'publish',
      seo_title          TEXT,
      seo_description    TEXT,
      published_at       TIMESTAMPTZ,
      updated_at         TIMESTAMPTZ,
      created_at         TIMESTAMPTZ DEFAULT NOW(),
      -- Existing columns if any
      active             BOOLEAN DEFAULT TRUE,
      editor_mode        VARCHAR(20) DEFAULT 'rich',
      raw_html           TEXT,
      raw_css            TEXT,
      raw_js             TEXT,
      gallery            JSONB DEFAULT '[]'::jsonb,
      bulk_images        JSONB DEFAULT '[]'::jsonb,
      faq_items          JSONB DEFAULT '[]'::jsonb,
      head_schema        TEXT,
      body_schema        TEXT,
      footer_schema      TEXT
    );
  `);
  console.log('✅ Table "blogs" ensured.');
}

async function upsertPost(client, post) {
  const query = `
    INSERT INTO blogs (
      wp_id, title, slug, content, excerpt, featured_image,
      author, author_description, categories, tags, status, seo_title, seo_description,
      published_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12, $13,
      $14, $15
    )
    ON CONFLICT (wp_id) DO UPDATE SET
      title              = EXCLUDED.title,
      slug               = EXCLUDED.slug,
      content            = EXCLUDED.content,
      excerpt            = EXCLUDED.excerpt,
      featured_image     = EXCLUDED.featured_image,
      author             = EXCLUDED.author,
      author_description = EXCLUDED.author_description,
      categories         = EXCLUDED.categories,
      tags               = EXCLUDED.tags,
      status             = EXCLUDED.status,
      seo_title          = EXCLUDED.seo_title,
      seo_description    = EXCLUDED.seo_description,
      published_at       = EXCLUDED.published_at,
      updated_at         = EXCLUDED.updated_at
    RETURNING blog_id;
  `;

  const values = [
    post.wp_id, post.title, post.slug, post.content, post.excerpt,
    post.featured_image, post.author, post.author_description, post.categories, post.tags,
    post.status, post.seo_title, post.seo_description,
    post.published_at, post.updated_at,
  ];

  const result = await client.query(query, values);
  return result.rows[0].blog_id;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🚀 WordPress → PostgreSQL Migration');
  console.log(`   Mode: ${DRY_RUN ? '🔍 DRY RUN (no DB writes)' : '💾 IMPORT MODE'}`);
  console.log(`   WP Site: ${WP_BASE_URL}\n`);

  // Fetch taxonomies
  console.log('📂 Fetching categories and tags...');
  const [categoryMap, tagMap] = await Promise.all([fetchCategories(), fetchTags()]);
  console.log(`   Categories: ${Object.keys(categoryMap).length}, Tags: ${Object.keys(tagMap).length}`);

  // DB setup
  let client;
  if (!DRY_RUN) {
    client = new Client(dbConfig);
    await client.connect();
    await ensureTable(client);
  }

  let page = START_PAGE;
  let totalPages = null;
  let totalImported = 0;
  let totalSkipped = 0;
  const errors = [];

  try {
    do {
      const { posts, totalPages: tp } = await fetchPosts(page);
      if (totalPages === null) {
        totalPages = tp;
        console.log(`   Total pages: ${totalPages}`);
      }

      for (const wpPost of posts) {
        try {
          const mapped = mapPost(wpPost, categoryMap, tagMap);

          if (DRY_RUN) {
            console.log(`  [DRY] "${mapped.title}" (wp_id: ${mapped.wp_id}, slug: ${mapped.slug})`);
            console.log(`        Categories: [${mapped.categories.join(', ')}]`);
            console.log(`        Tags:       [${mapped.tags.join(', ')}]`);
            console.log(`        Image:      ${mapped.featured_image || 'none'}`);
            console.log(`        Content length: ${mapped.content.length} chars\n`);
          } else {
            const newId = await upsertPost(client, mapped);
            console.log(`  ✅ Imported: "${mapped.title}" → DB id ${newId}`);
          }

          totalImported++;
        } catch (err) {
          console.error(`  ❌ Failed: wp_id ${wpPost.id} — ${err.message}`);
          errors.push({ wp_id: wpPost.id, title: wpPost.title?.rendered, error: err.message });
          totalSkipped++;
        }
      }

      page++;
    } while (page <= totalPages);

  } finally {
    if (client) await client.end();
  }

  console.log('\n─────────────────────────────────');
  console.log(`✅ Done! Processed: ${totalImported}, Errors: ${totalSkipped}`);
  if (errors.length) {
    console.log('\n❌ Failed posts:');
    errors.forEach(e => console.log(`   WP ID ${e.wp_id}: ${e.title} — ${e.error}`));
  }
  if (DRY_RUN) {
    console.log('\n💡 Run with --import flag to write to the database.');
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
