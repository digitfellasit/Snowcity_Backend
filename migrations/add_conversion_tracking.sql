-- Conversion Tracking Schema Migration
-- Tables: visits, booking_visits, ad_spend

-- 1. Visits: logs every landing page visit with UTM/click IDs
CREATE TABLE IF NOT EXISTS visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL,
  user_id UUID,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_content TEXT,
  utm_term TEXT,
  gclid TEXT,
  fbclid TEXT,
  landing_page TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);
CREATE INDEX IF NOT EXISTS idx_visits_source ON visits(utm_source);
CREATE INDEX IF NOT EXISTS idx_visits_created ON visits(created_at);

-- 2. Booking attribution: links completed bookings to traffic sources
CREATE TABLE IF NOT EXISTS booking_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  session_id TEXT,
  order_id INT,
  amount NUMERIC(10,2),
  source TEXT,
  campaign TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_visits_session ON booking_visits(session_id);
CREATE INDEX IF NOT EXISTS idx_booking_visits_source ON booking_visits(source);
CREATE INDEX IF NOT EXISTS idx_booking_visits_order ON booking_visits(order_id);

-- 3. Ad spend tracking for ROAS calculation
CREATE TABLE IF NOT EXISTS ad_spend (
  id SERIAL PRIMARY KEY,
  source TEXT NOT NULL,
  campaign TEXT,
  spend NUMERIC(10,2) NOT NULL DEFAULT 0,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ad_spend_source ON ad_spend(source);
