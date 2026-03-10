-- Migration: Add payment_datetime to orders and bookings
-- Run: psql -f db/migrations/0024_add_payment_datetime.sql

BEGIN;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='orders' AND column_name='payment_datetime') THEN
        ALTER TABLE orders ADD COLUMN payment_datetime VARCHAR(50);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='bookings' AND column_name='payment_datetime') THEN
        ALTER TABLE bookings ADD COLUMN payment_datetime VARCHAR(50);
    END IF;
END $$;

COMMIT;
