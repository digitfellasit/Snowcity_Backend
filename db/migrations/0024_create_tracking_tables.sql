-- Migration: Create tracking tables (visits, booking_visits, ad_spend)
-- Required by trackingService.js for conversion tracking

BEGIN;

CREATE TABLE IF NOT EXISTS visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    VARCHAR(255) NOT NULL,
  user_id       BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  utm_source    VARCHAR(100),
  utm_medium    VARCHAR(100),
  utm_campaign  VARCHAR(255),
  utm_content   VARCHAR(255),
  utm_term      VARCHAR(255),
  gclid         VARCHAR(255),
  fbclid        VARCHAR(255),
  landing_page  TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);

CREATE TABLE IF NOT EXISTS booking_visits (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
  session_id    VARCHAR(255) NOT NULL,
  order_id      BIGINT REFERENCES orders(order_id) ON DELETE SET NULL,
  amount        NUMERIC(12,2) DEFAULT 0,
  source        VARCHAR(100) DEFAULT 'direct',
  campaign      VARCHAR(255),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_visits_session ON booking_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_booking_visits_order ON booking_visits(order_id);

CREATE TABLE IF NOT EXISTS ad_spend (
  id            BIGSERIAL PRIMARY KEY,
  source        VARCHAR(100) NOT NULL,
  campaign      VARCHAR(255),
  spend         NUMERIC(12,2) NOT NULL DEFAULT 0,
  period_start  DATE,
  period_end    DATE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
