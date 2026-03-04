-- migrations/20260304_update_blogs_schema.sql

BEGIN;

-- Add wp_id
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS wp_id INTEGER UNIQUE;

-- Add excerpt
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS excerpt TEXT;

-- Rename image_url to featured_image
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='image_url') THEN
    ALTER TABLE blogs RENAME COLUMN image_url TO featured_image;
  END IF;
END $$;

-- Add categories and tags
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS categories TEXT[];
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS tags TEXT[];

-- Add status
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'publish';

-- Rename meta_title to seo_title
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='meta_title') THEN
    ALTER TABLE blogs RENAME COLUMN meta_title TO seo_title;
  END IF;
END $$;

-- Rename meta_description to seo_description
DO $$ 
BEGIN 
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='meta_description') THEN
    ALTER TABLE blogs RENAME COLUMN meta_description TO seo_description;
  END IF;
END $$;

-- Add published_at
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

COMMIT;
