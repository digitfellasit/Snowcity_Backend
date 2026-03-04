-- migrations/20260304_add_image_alt_to_blogs.sql

BEGIN;

-- Add image_alt
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS image_alt character varying(255);

COMMIT;
