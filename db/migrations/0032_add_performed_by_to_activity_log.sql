-- Migration 0032: Add performed_by column to booking_activity_log
-- Date: 2026-03-18

BEGIN;

ALTER TABLE booking_activity_log
  ADD COLUMN IF NOT EXISTS performed_by VARCHAR(255);

COMMIT;
