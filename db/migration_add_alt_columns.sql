-- Migration to add missing image and alt text columns

-- Attractions
ALTER TABLE attractions ADD COLUMN IF NOT EXISTS image_alt text;
ALTER TABLE attractions ADD COLUMN IF NOT EXISTS desktop_image_alt text;

-- Combos
ALTER TABLE combos ADD COLUMN IF NOT EXISTS image_alt text;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS desktop_image_alt text;

-- Banners
ALTER TABLE banners ADD COLUMN IF NOT EXISTS web_image_alt text;
ALTER TABLE banners ADD COLUMN IF NOT EXISTS mobile_image_alt text;

-- Blogs
ALTER TABLE blogs ADD COLUMN IF NOT EXISTS image_alt text;

-- Offers
ALTER TABLE offers ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS image_alt text;

-- CMS Pages
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS hero_image text;
ALTER TABLE cms_pages ADD COLUMN IF NOT EXISTS hero_image_alt text;
