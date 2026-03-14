-- db/migrations/0029_allow_more_info_placement.sql
BEGIN;

-- Update the placement check constraint
ALTER TABLE cms_pages DROP CONSTRAINT IF EXISTS cms_pages_placement_check;
ALTER TABLE cms_pages ADD CONSTRAINT cms_pages_placement_check CHECK (placement IN ('none', 'home_bottom', 'more_info', 'attraction_details'));

-- Make slug nullable
ALTER TABLE cms_pages ALTER COLUMN slug DROP NOT NULL;

COMMIT;
