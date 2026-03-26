-- Optimize gallery item fetching by adding an index on created_at
-- This improves performance for the list query which uses ORDER BY gi.created_at ASC

CREATE INDEX IF NOT EXISTS idx_gallery_items_created_at ON gallery_items(created_at ASC);
