-- Migration: Fix log_booking_activity() trigger function
-- Problem: lower() does not work on enum types (payment_status, booking_status)
-- Fix: Cast enum values to text before calling lower()

BEGIN;

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

  -- On UPDATE: log payment status changes
  IF TG_OP = 'UPDATE' THEN
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
