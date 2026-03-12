BEGIN;

-- Add day selection mode to dynamic_pricing_rules
-- Allows rules to apply only on specific day types within their date ranges
ALTER TABLE dynamic_pricing_rules
  ADD COLUMN IF NOT EXISTS day_selection_mode VARCHAR(20) NOT NULL DEFAULT 'all_days',
  ADD COLUMN IF NOT EXISTS selected_weekdays INTEGER[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_dates DATE[] DEFAULT NULL;

-- Constraint for valid day_selection_mode values
ALTER TABLE dynamic_pricing_rules
  ADD CONSTRAINT dynamic_pricing_rules_day_mode_check
    CHECK (day_selection_mode IN ('all_days', 'weekends_only', 'custom_weekdays', 'specific_dates'));

COMMENT ON COLUMN dynamic_pricing_rules.day_selection_mode IS 'Which days within the date range the rule applies: all_days, weekends_only, custom_weekdays, specific_dates';
COMMENT ON COLUMN dynamic_pricing_rules.selected_weekdays IS 'Array of day numbers (0=Sunday, 1=Monday, ..., 6=Saturday) when day_selection_mode=custom_weekdays';
COMMENT ON COLUMN dynamic_pricing_rules.custom_dates IS 'Array of specific dates when day_selection_mode=specific_dates';

COMMIT;
