/**
 * SSR Template Builder — Generates full HTML documents for SEO crawlers
 * with meta tags, JSON-LD structured data, Open Graph, and visible content.
 */

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function stripTags(html) {
    if (!html) return '';
    return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function buildFaqSchema(faqItems) {
    if (!Array.isArray(faqItems) || !faqItems.length) return '';
    const entries = faqItems
        .filter(f => f && f.question && f.answer)
        .map(f => ({
            '@type': 'Question',
            name: f.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: f.answer,
            },
        }));
    if (!entries.length) return '';
    return JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: entries,
    });
}

function buildJsonLdTag(obj) {
    if (!obj || (typeof obj === 'object' && !Object.keys(obj).length)) return '';
    const json = typeof obj === 'string' ? obj : JSON.stringify(obj);
    if (!json || json === '{}' || json === '[]') return '';
    return `<script type="application/ld+json">${json}</script>`;
}

/**
 * @param {object} data
 * @param {string} data.title
 * @param {string} data.description
 * @param {string} data.keywords
 * @param {string} data.canonical
 * @param {string} data.image
 * @param {string} data.imageAlt
 * @param {string} data.content — HTML content for visible body
 * @param {Array}  data.faq_items — [{question, answer}]
 * @param {object} data.head_schema — JSON-LD for head
 * @param {object} data.body_schema — JSON-LD for body
 * @param {object} data.footer_schema — JSON-LD for footer
 * @param {object} data.siteSettings — global SEO settings
 * @param {string} data.type — 'blog' or 'page'
 * @param {string} data.author
 * @param {string} data.publishedDate
 * @param {string} data.modifiedDate
 * @param {string} data.clientUrl — frontend URL for hydration link
 */
function buildSeoHtml(data) {
    const {
        title = '',
        description = '',
        keywords = '',
        canonical = '',
        image = '',
        imageAlt = '',
        content = '',
        faq_items = [],
        head_schema = {},
        body_schema = {},
        footer_schema = {},
        siteSettings = {},
        type = 'page',
        author = '',
        publishedDate = '',
        modifiedDate = '',
        clientUrl = '',
    } = data;

    const siteName = siteSettings.site_name || 'SnowCity Bangalore';
    const defaultImage = siteSettings.default_image || '';
    const ogImage = image || defaultImage;

    // Build head schema tags
    const headSchemaHtml = [
        buildJsonLdTag(siteSettings.organization_schema),
        buildJsonLdTag(siteSettings.head_schema),
        buildJsonLdTag(head_schema),
        buildFaqSchema(faq_items) ? `<script type="application/ld+json">${buildFaqSchema(faq_items)}</script>` : '',
    ].filter(Boolean).join('\n    ');

    // Build body schema
    const bodySchemaHtml = [
        buildJsonLdTag(siteSettings.body_schema),
        buildJsonLdTag(body_schema),
    ].filter(Boolean).join('\n    ');

    // Build footer schema
    const footerSchemaHtml = [
        buildJsonLdTag(siteSettings.footer_schema),
        buildJsonLdTag(footer_schema),
    ].filter(Boolean).join('\n    ');

    // Build FAQ visible section
    let faqHtml = '';
    const validFaqs = (faq_items || []).filter(f => f && f.question && f.answer);
    if (validFaqs.length) {
        faqHtml = `
    <section class="faq-section" itemscope itemtype="https://schema.org/FAQPage">
      <h2>Frequently Asked Questions</h2>
      ${validFaqs.map(f => `
      <div class="faq-item" itemscope itemprop="mainEntity" itemtype="https://schema.org/Question">
        <h3 itemprop="name">${escapeHtml(f.question)}</h3>
        <div itemscope itemprop="acceptedAnswer" itemtype="https://schema.org/Answer">
          <div itemprop="text">${f.answer}</div>
        </div>
      </div>`).join('')}
    </section>`;
    }

    // Article schema for blogs
    let articleSchemaHtml = '';
    if (type === 'blog') {
        const articleSchema = {
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: title,
            description: description || stripTags(content).substring(0, 160),
            image: ogImage || undefined,
            author: author ? { '@type': 'Person', name: author } : undefined,
            publisher: {
                '@type': 'Organization',
                name: siteName,
            },
            datePublished: publishedDate || undefined,
            dateModified: modifiedDate || publishedDate || undefined,
            mainEntityOfPage: canonical || undefined,
        };
        // Remove undefined keys
        Object.keys(articleSchema).forEach(k => articleSchema[k] === undefined && delete articleSchema[k]);
        articleSchemaHtml = buildJsonLdTag(articleSchema);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${escapeHtml(title)} | ${escapeHtml(siteName)}</title>
    <meta name="description" content="${escapeHtml(description || stripTags(content).substring(0, 160))}">
    ${keywords ? `<meta name="keywords" content="${escapeHtml(keywords)}">` : ''}
    ${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
    ${author ? `<meta name="author" content="${escapeHtml(author)}">` : ''}
    <meta name="robots" content="index, follow">

    <!-- Open Graph -->
    <meta property="og:type" content="${type === 'blog' ? 'article' : 'website'}">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description || stripTags(content).substring(0, 160))}">
    ${ogImage ? `<meta property="og:image" content="${escapeHtml(ogImage)}">` : ''}
    ${canonical ? `<meta property="og:url" content="${escapeHtml(canonical)}">` : ''}
    <meta property="og:site_name" content="${escapeHtml(siteName)}">
    ${publishedDate ? `<meta property="article:published_time" content="${publishedDate}">` : ''}
    ${modifiedDate ? `<meta property="article:modified_time" content="${modifiedDate}">` : ''}

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description || stripTags(content).substring(0, 160))}">
    ${ogImage ? `<meta name="twitter:image" content="${escapeHtml(ogImage)}">` : ''}
    ${imageAlt ? `<meta name="twitter:image:alt" content="${escapeHtml(imageAlt)}">` : ''}

    <!-- Preload fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Poppins:wght@400;600;700&display=swap" rel="stylesheet">

    <!-- Structured Data -->
    ${articleSchemaHtml}
    ${headSchemaHtml}

    <style>
      body { font-family: 'DM Sans', 'Poppins', sans-serif; margin: 0; padding: 0; color: #1a1a2e; background: #f8fafc; }
      .ssr-container { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
      .ssr-container h1 { font-size: 2rem; margin-bottom: 1rem; }
      .ssr-container img { max-width: 100%; height: auto; border-radius: 12px; }
      .ssr-meta { color: #64748b; font-size: 0.875rem; margin-bottom: 1.5rem; }
      .ssr-content { line-height: 1.8; }
      .ssr-content img { max-width: 100%; }
      .faq-section { margin-top: 3rem; padding-top: 2rem; border-top: 1px solid #e2e8f0; }
      .faq-section h2 { font-size: 1.5rem; margin-bottom: 1.5rem; }
      .faq-item { margin-bottom: 1.5rem; }
      .faq-item h3 { font-size: 1.1rem; color: #1e293b; margin-bottom: 0.5rem; }
      .faq-item div { color: #475569; line-height: 1.6; }
      .hydrate-link { text-align: center; margin-top: 2rem; }
      .hydrate-link a { color: #2563eb; text-decoration: none; font-weight: 600; }
    </style>
</head>
<body>
    ${bodySchemaHtml}

    <main class="ssr-container">
      <h1>${escapeHtml(title)}</h1>
      ${author || publishedDate ? `<div class="ssr-meta">${author ? `By ${escapeHtml(author)}` : ''}${author && publishedDate ? ' · ' : ''}${publishedDate ? new Date(publishedDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : ''}</div>` : ''}
      ${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(imageAlt || title)}" loading="eager">` : ''}
      <div class="ssr-content">
        ${content || ''}
      </div>
      ${faqHtml}
      ${clientUrl ? `<div class="hydrate-link"><a href="${escapeHtml(clientUrl)}">View interactive version →</a></div>` : ''}
    </main>

    ${footerSchemaHtml}

    <!-- SPA hydration hint: crawlers see full content above; browsers redirect to SPA -->
    <noscript>
      <p>This page is best viewed with JavaScript enabled.</p>
    </noscript>
</body>
</html>`;
}

module.exports = { buildSeoHtml, buildFaqSchema, buildJsonLdTag, escapeHtml, stripTags };
