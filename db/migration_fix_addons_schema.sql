-- Migration to add image_alt column to addons table
ALTER TABLE addons ADD COLUMN IF NOT EXISTS image_alt TEXT;
