-- Add short_description to attractions
ALTER TABLE attractions ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Add short_description to combos
ALTER TABLE combos ADD COLUMN IF NOT EXISTS short_description TEXT;

-- Add description to combos
ALTER TABLE combos ADD COLUMN IF NOT EXISTS description TEXT;
