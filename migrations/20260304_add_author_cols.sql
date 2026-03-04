-- migrations/20260304_add_author_cols.sql

BEGIN;

-- Add author_image_url
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS author_image_url character varying(255);

-- Add author_description
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS author_description text;

COMMIT;
