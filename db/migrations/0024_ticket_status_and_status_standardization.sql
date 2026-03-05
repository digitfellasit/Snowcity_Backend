-- Migration 0024: Add ticket_status, standardize booking/payment status enums
-- Date: 2026-03-05

BEGIN;

-- ============================================================
-- 1. Add new booking_status enum values
-- ============================================================
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'PENDING_PAYMENT';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'CONFIRMED';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'ABANDONED';
ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'REFUNDED';

COMMIT;
BEGIN;

-- ============================================================
-- 2. Add new payment_status enum values
-- ============================================================
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'INITIATED';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'SUCCESS';
ALTER TYPE payment_status ADD VALUE IF NOT EXISTS 'TIMED_OUT';

COMMIT;
BEGIN;

-- ============================================================
-- 3. Add ticket_status column to bookings table
-- ============================================================
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS ticket_status VARCHAR(20) NOT NULL DEFAULT 'NOT_REDEEMED';

-- ============================================================
-- 4. Migrate existing data
--    Booked + Completed payment → CONFIRMED
--    Redeemed → CONFIRMED + ticket_status = REDEEMED
-- ============================================================
UPDATE bookings
  SET booking_status = 'CONFIRMED'
  WHERE booking_status = 'Booked'
    AND payment_status = 'Completed';

UPDATE bookings
  SET ticket_status = 'REDEEMED',
      booking_status = 'CONFIRMED'
  WHERE booking_status = 'Redeemed';

-- ============================================================
-- 5. Update trigger to also log ticket_status changes
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
      NEW.booking_status::text
    );
    RETURN NEW;
  END IF;

  -- On UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Log payment status changes
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'payment_' || lower(NEW.payment_status::text),
        'Payment status changed from ' || COALESCE(OLD.payment_status::text, 'None') || ' to ' || NEW.payment_status::text,
        OLD.payment_status::text,
        NEW.payment_status::text
      );
    END IF;

    -- Log booking status changes
    IF OLD.booking_status IS DISTINCT FROM NEW.booking_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'status_' || lower(NEW.booking_status::text),
        'Booking status changed from ' || COALESCE(OLD.booking_status::text, 'None') || ' to ' || NEW.booking_status::text,
        OLD.booking_status::text,
        NEW.booking_status::text
      );
    END IF;

    -- Log ticket status changes
    IF OLD.ticket_status IS DISTINCT FROM NEW.ticket_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        CASE WHEN NEW.ticket_status = 'REDEEMED' THEN 'ticket_redeemed' ELSE 'ticket_not_redeemed' END,
        'Ticket status changed from ' || COALESCE(OLD.ticket_status, 'None') || ' to ' || NEW.ticket_status,
        OLD.ticket_status,
        NEW.ticket_status
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

COMMIT;
