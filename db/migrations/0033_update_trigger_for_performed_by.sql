-- Migration 0033: Update log_booking_activity trigger for performed_by
-- Date: 2026-03-18

BEGIN;

CREATE OR REPLACE FUNCTION log_booking_activity()
RETURNS TRIGGER AS $$
DECLARE
  v_performed_by TEXT;
BEGIN
  -- Retrieve the current administrator email from a session variable
  -- SET LOCAL app.current_user = 'admin@email.com';
  v_performed_by := current_setting('app.current_user', true);

  -- On INSERT: log booking creation
  IF TG_OP = 'INSERT' THEN
    INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, new_value, performed_by)
    VALUES (
      NEW.order_id,
      NEW.booking_id,
      'booking_created',
      'Booking created',
      NEW.booking_status::text,
      v_performed_by
    );
    RETURN NEW;
  END IF;

  -- On UPDATE
  IF TG_OP = 'UPDATE' THEN
    -- Log payment status changes
    IF OLD.payment_status IS DISTINCT FROM NEW.payment_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value, performed_by)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'payment_' || lower(NEW.payment_status::text),
        'Payment status changed from ' || COALESCE(OLD.payment_status::text, 'None') || ' to ' || NEW.payment_status::text,
        OLD.payment_status::text,
        NEW.payment_status::text,
        v_performed_by
      );
    END IF;

    -- Log booking status changes
    IF OLD.booking_status IS DISTINCT FROM NEW.booking_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value, performed_by)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        'status_' || lower(NEW.booking_status::text),
        'Booking status changed from ' || COALESCE(OLD.booking_status::text, 'None') || ' to ' || NEW.booking_status::text,
        OLD.booking_status::text,
        NEW.booking_status::text,
        v_performed_by
      );
    END IF;

    -- Log ticket status changes
    IF OLD.ticket_status IS DISTINCT FROM NEW.ticket_status THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, old_value, new_value, performed_by)
      VALUES (
        NEW.order_id,
        NEW.booking_id,
        CASE WHEN NEW.ticket_status = 'REDEEMED' THEN 'ticket_redeemed' ELSE 'ticket_not_redeemed' END,
        'Ticket status changed from ' || COALESCE(OLD.ticket_status, 'None') || ' to ' || NEW.ticket_status,
        OLD.ticket_status,
        NEW.ticket_status,
        v_performed_by
      );
    END IF;

    -- Log ticket PDF generation
    IF OLD.ticket_pdf IS DISTINCT FROM NEW.ticket_pdf AND NEW.ticket_pdf IS NOT NULL THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, performed_by)
      VALUES (NEW.order_id, NEW.booking_id, 'ticket_generated', 'Ticket PDF generated', v_performed_by);
    END IF;

    -- Log WhatsApp sent
    IF OLD.whatsapp_sent IS DISTINCT FROM NEW.whatsapp_sent AND NEW.whatsapp_sent = TRUE THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, performed_by)
      VALUES (NEW.order_id, NEW.booking_id, 'whatsapp_sent', 'WhatsApp ticket sent', v_performed_by);
    END IF;

    -- Log email sent
    IF OLD.email_sent IS DISTINCT FROM NEW.email_sent AND NEW.email_sent = TRUE THEN
      INSERT INTO booking_activity_log (order_id, booking_id, event_type, event_detail, performed_by)
      VALUES (NEW.order_id, NEW.booking_id, 'email_sent', 'Email ticket sent', v_performed_by);
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

COMMIT;
