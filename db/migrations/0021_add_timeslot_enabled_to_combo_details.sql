BEGIN;

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
                'position_in_combo', ca.position_in_combo,
                'time_slot_enabled', a.time_slot_enabled
            )
        ) FILTER (WHERE ca.attraction_id IS NOT NULL), 
        '[]'::json
    ) as attractions
FROM combos c
LEFT JOIN combo_attractions ca ON c.combo_id = ca.combo_id
LEFT JOIN attractions a ON ca.attraction_id = a.attraction_id
GROUP BY c.combo_id;

COMMIT;
