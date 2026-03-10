-- Migration: Add payment_method to orders and bookings
-- Run: psql -f db/migrations/0023_add_payment_method.sql

BEGIN;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_method') THEN
        ALTER TABLE orders ADD COLUMN payment_method VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_method') THEN
        ALTER TABLE bookings ADD COLUMN payment_method VARCHAR(50);
    END IF;
END $$;

COMMIT;
