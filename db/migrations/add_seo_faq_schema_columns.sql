-- Migration: Add FAQ items and schema markup columns to blogs and cms_pages
-- Safe to run multiple times (uses IF NOT EXISTS)

-- ============ BLOGS TABLE ============
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS faq_items     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS head_schema   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS body_schema   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS footer_schema JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ============ CMS_PAGES TABLE ============
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS faq_items     JSONB NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS head_schema   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS body_schema   JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS footer_schema JSONB NOT NULL DEFAULT '{}'::jsonb;
