-- Add day selection rules to attractions and combos
-- day_rule_type: 'all_days' (default), 'weekends', 'weekdays', 'custom_days'
-- custom_days: array of day numbers (0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat)

BEGIN;

ALTER TABLE attractions
  ADD COLUMN IF NOT EXISTS day_rule_type VARCHAR(20) NOT NULL DEFAULT 'all_days',
  ADD COLUMN IF NOT EXISTS custom_days  INTEGER[]   DEFAULT '{}';

ALTER TABLE combos
  ADD COLUMN IF NOT EXISTS day_rule_type VARCHAR(20) NOT NULL DEFAULT 'all_days',
  ADD COLUMN IF NOT EXISTS custom_days  INTEGER[]   DEFAULT '{}';

-- Recreate combo_details view to include new columns
-- (PostgreSQL views cache column definitions from SELECT *)
DROP VIEW IF EXISTS combo_details;
CREATE OR REPLACE VIEW combo_details AS
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
