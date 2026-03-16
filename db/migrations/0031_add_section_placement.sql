-- db/migrations/0031_add_section_placement.sql
-- Add 'section_more_info' placement for inline content sections

BEGIN;

-- Update the placement check constraint to allow section placements
ALTER TABLE cms_pages DROP CONSTRAINT IF EXISTS cms_pages_placement_check;
ALTER TABLE cms_pages ADD CONSTRAINT cms_pages_placement_check
  CHECK (placement IN ('none', 'home_bottom', 'more_info', 'attraction_details', 'section_more_info', 'section_attraction', 'section_combo'));

COMMIT;
