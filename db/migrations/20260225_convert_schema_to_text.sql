BEGIN;

-- Drop views that depend on altered columns
DROP VIEW IF EXISTS combo_details;
DROP VIEW IF EXISTS offer_summary;

-- 1. CMS_PAGES
ALTER TABLE cms_pages ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE cms_pages ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE cms_pages ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE cms_pages ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE cms_pages ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE cms_pages ALTER COLUMN footer_schema SET DEFAULT '';

-- 2. BLOGS
ALTER TABLE blogs ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE blogs ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE blogs ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE blogs ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE blogs ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE blogs ALTER COLUMN footer_schema SET DEFAULT '';

-- 3. ATTRACTIONS
ALTER TABLE attractions ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE attractions ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE attractions ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE attractions ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE attractions ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE attractions ALTER COLUMN footer_schema SET DEFAULT '';

-- 4. COMBOS
ALTER TABLE combos ALTER COLUMN head_schema TYPE TEXT USING head_schema::text;
ALTER TABLE combos ALTER COLUMN body_schema TYPE TEXT USING body_schema::text;
ALTER TABLE combos ALTER COLUMN footer_schema TYPE TEXT USING footer_schema::text;

ALTER TABLE combos ALTER COLUMN head_schema SET DEFAULT '';
ALTER TABLE combos ALTER COLUMN body_schema SET DEFAULT '';
ALTER TABLE combos ALTER COLUMN footer_schema SET DEFAULT '';

-- Recreate offer_summary view
CREATE OR REPLACE VIEW offer_summary AS
SELECT
    o.offer_id,
    o.title,
    o.description,
    o.image_url,
    o.rule_type,
    o.discount_type,
    o.discount_value,
    o.valid_from,
    o.valid_to,
    o.active,
    COUNT(r.rule_id) as rule_count,
    MAX(r.created_at) as last_updated
FROM public.offers o
LEFT JOIN public.offer_rules r ON o.offer_id = r.offer_id
GROUP BY
    o.offer_id,
    o.title,
    o.description,
    o.image_url,
    o.rule_type,
    o.discount_type,
    o.discount_value,
    o.valid_from,
    o.valid_to,
    o.active;

-- Recreate combo_details view
CREATE OR REPLACE VIEW combo_d
SELECT 
    c.*,
    COALESCE(
        json_agg(
            json_build_object(
                'attraction_id', ca.attraction_id,
                'title', a.title,
                'price', ca.attraction_price,
                'image_url', a.image_url,
                'desktop_image_url', a.desktop_image_url,
                'slug', a.slug,
                'position_in_combo', ca.position_in_combo
            )
        ) FILTER (WHERE ca.attraction_id IS NOT NULL), 
        '[]'::json
    ) as attractions
FROM combos c
LEFT JOIN combo_attractions ca ON c.combo_id = ca.combo_id
LEFT JOIN attractions a ON ca.attraction_id = a.attraction_id
GROUP BY c.combo_id;

COMMIT;
