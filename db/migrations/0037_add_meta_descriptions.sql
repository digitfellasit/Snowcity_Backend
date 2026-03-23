-- Add meta_description column to attractions and combos tables
ALTER TABLE attractions ADD COLUMN IF NOT EXISTS meta_description TEXT;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS meta_description TEXT;
