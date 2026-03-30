-- Migration: Remove offer target constraint
-- Description: Removes the offer_rules_target_required check constraint to allow custom selection without a specific target_id and applies_to_all.
-- Created: 2026-03-30
-- NOTE: If this constraint does not exist, it will silently pass.

ALTER TABLE offer_rules DROP CONSTRAINT IF EXISTS offer_rules_target_required;
