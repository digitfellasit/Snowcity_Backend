-- Migration: Convert JSONB schema columns to TEXT to support raw HTML/Scripts
-- Tables: cms_pages, blogs, attractions, combos
-- Columns: head_schema, body_schema, footer_schema

BEGIN;

-- 1. CMS_PAGES
ALTER TABLE cms_pages ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE cms_pages ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE cms_pages ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE cms_pages ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE cms_pages ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE cms_pages ALTER COLUMN footer_schema SET DEFAULT '';

-- 2. BLOGS
ALTER TABLE blogs ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE blogs ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE blogs ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE blogs ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE blogs ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE blogs ALTER COLUMN footer_schema SET DEFAULT '';

-- 3. ATTRACTIONS
-- These might already be TEXT or missing in some environments, adding IF EXISTS checks via DO block for safety if possible, 
-- but standard ALTER TABLE is usually fine if we know they exist.
ALTER TABLE attractions ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE attractions ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE attractions ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE attractions ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE attractions ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE attractions ALTER COLUMN footer_schema SET DEFAULT '';

-- 4. COMBOS
ALTER TABLE combos ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE combos ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE combos ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE combos ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE combos ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE combos ALTER COLUMN footer_schema SET DEFAULT '';

COMMIT;
