-- Migration 0022: New order_ref format (SC + 6 alphanumeric) and activity log
-- Run: psql -f db/migrations/0022_new_order_ref_format.sql

BEGIN;

-- ============================================================
-- 1. Function to generate SC + 6 random alphanumeric ref
--    Characters: A-Z (no I, O) + 2-9 (no 0, 1)
--    Total charset: 24 letters + 8 digits = 32 chars
-- ============================================================

CREATE OR REPLACE FUNCTION generate_sc_order_ref()
RETURNS TEXT AS $$
DECLARE
  charset TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result TEXT;
  i INT;
  max_attempts INT := 100;
  attempt INT := 0;
BEGIN
  LOOP
    result := 'SC';
    FOR i IN 1..6 LOOP
      result := result || substr(charset, floor(random() * length(charset) + 1)::int, 1);
    END LOOP;

    -- Check for uniqueness
    IF NOT EXISTS (SELECT 1 FROM orders WHERE order_ref = result) THEN
      RETURN result;
    END IF;

    attempt := attempt + 1;
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique order_ref after % attempts', max_attempts;
    END IF;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 2. Update orders table default
-- ============================================================

ALTER TABLE orders ALTER COLUMN order_ref SET DEFAULT generate_sc_order_ref();

-- ============================================================
-- 3. Create booking_activity_log table
-- ============================================================

CREATE TABLE IF NOT EXISTS booking_activity_log (
  log_id        BIGSERIAL PRIMARY KEY,
  order_id      BIGINT REFERENCES orders(order_id) ON DELETE CASCADE,
  booking_id    BIGINT REFERENCES bookings(booking_id) ON DELETE CASCADE,
  event_type    VARCHAR(50) NOT NULL,          -- 'booking_created', 'payment_completed', 'status_changed', 'ticket_sent', etc.
  event_detail  TEXT,                          -- Human-readable description
  old_value     VARCHAR(100),                  -- Previous status value (for changes)
  new_value     VARCHAR(100),                  -- New status value (for changes)
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_order ON booking_activity_log(order_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_booking ON booking_activity_log(booking_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_created ON booking_activity_log(created_at);

-- ============================================================
-- 4. Trigger function to auto-log booking events
-- ============================================================

CREATE OR REPLACE FUNCTION log_booking_activity()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: log booking creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, new_value)
    VALUES (
      NEW.order_id,
      NEW.booking_id,
      'booking_created',
      'Booking created',
      NEW.booking_status
    );
    RETURN NEW;
  END IF;

  -- On UPDATE: log payment status changes
  IF TG_OP = 'UPDATE' THEN
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'payment_' || lower(NEW.payment_status),
        'Payment status changed from ' || COALESCE(OLD.payment_status, 'None') || ' to ' || NEW.payment_status,
        OLD.payment_status,
        NEW.payment_status
      );
    END IF;

    -- Log booking status changes
    IF OLD.booking_status IS DISTINCT FROM NEW.booking_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'status_' || lower(NEW.booking_status),
        'Booking status changed from ' || COALESCE(OLD.booking_status, 'None') || ' to ' || NEW.booking_status,
        OLD.booking_status,
        NEW.booking_status
      );
    END IF;

    -- Log ticket PDF generation
    IF OLD.ticket_pdf IS DISTINCT FROM NEW.ticket_pdf AND NEW.ticket_pdf IS NOT NULL THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail)
      VALUES (NEW.order_id, NEW.booking_id, 'ticket_generated', 'Ticket PDF generated');
    END IF;

    -- Log WhatsApp sent
    IF OLD.whatsapp_sent IS DISTINCT FROM NEW.whatsapp_sent AND NEW.whatsapp_sent = TRUE THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail)
      VALUES (NEW.order_id, NEW.booking_id, 'whatsapp_sent', 'WhatsApp ticket sent');
    END IF;

    -- Log email sent
    IF OLD.email_sent IS DISTINCT FROM NEW.email_sent AND NEW.email_sent = TRUE THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail)
      VALUES (NEW.order_id, NEW.booking_id, 'email_sent', 'Email ticket sent');
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. Attach trigger to bookings table
-- ============================================================

DROP TRIGGER IF EXISTS trg_booking_activity_log ON bookings;

CREATE TRIGGER trg_booking_activity_log
  AFTER INSERT OR UPDATE ON bookings
  FOR EACH ROW
  EXECUTE FUNCTION log_booking_activity();

COMMIT;
