-- Migration: Add First N Tickets Offer Support
-- Description: Adds 'first_n_tickets' to offer_rule_type ENUM and ticket_limit/offer_price columns
-- Created: 2026-03-22

-- Step 1: Add 'first_n_tickets' to the offer_rule_type ENUM (safe, idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'first_n_tickets' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'offer_rule_type')) THEN
    ALTER TYPE offer_rule_type ADD VALUE 'first_n_tickets';
  END IF;
END
$$;

-- Step 2: Add ticket_limit and offer_price columns to offer_rules
ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS ticket_limit INTEGER DEFAULT NULL;
ALTER TABLE offer_rules ADD COLUMN IF NOT EXISTS offer_price NUMERIC(10, 2) DEFAULT NULL;
