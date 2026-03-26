-- Add sort_order column to attractions, combos, offers, and promo_cards
ALTER TABLE attractions ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE combos ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE offers ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
ALTER TABLE promo_cards ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;

-- Optional: Add index for sorting performance
CREATE INDEX IF NOT EXISTS idx_attractions_sort_order ON attractions(sort_order);
CREATE INDEX IF NOT EXISTS idx_combos_sort_order ON combos(sort_order);
CREATE INDEX IF NOT EXISTS idx_offers_sort_order ON offers(sort_order);
CREATE INDEX IF NOT EXISTS idx_promo_cards_sort_order ON promo_cards(sort_order);
