-- Migration: Create attraction_date_prices table
-- Description: Table to store custom pricing for attractions on specific dates

CREATE TABLE IF NOT EXISTS attraction_date_prices (
    id SERIAL PRIMARY KEY,
    attraction_id INTEGER NOT NULL REFERENCES attractions(attraction_id) ON DELETE CASCADE,
    date DATE NOT NULL,
    price DECIMAL(10,2) NOT NULL CHECK (price >= 0),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Ensure only one price per attraction per date
    UNIQUE(attraction_id, date)
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_attraction_date_prices_attraction_id ON attraction_date_prices(attraction_id);
CREATE INDEX IF NOT EXISTS idx_attraction_date_prices_date ON attraction_date_prices(date);
CREATE INDEX IF NOT EXISTS idx_attraction_date_prices_active ON attraction_date_prices(is_active);

-- Add comment to table
COMMENT ON TABLE attraction_date_prices IS 'Custom pricing for attractions on specific dates';

-- Add comments to columns
COMMENT ON COLUMN attraction_date_prices.id IS 'Primary key';
COMMENT ON COLUMN attraction_date_prices.attraction_id IS 'Reference to attractions table';
COMMENT ON COLUMN attraction_date_prices.date IS 'Date for which custom price applies';
COMMENT ON COLUMN attraction_date_prices.price IS 'Custom price for this attraction on this date';
COMMENT ON COLUMN attraction_date_prices.is_active IS 'Whether this pricing rule is active';
COMMENT ON COLUMN attraction_date_prices.created_at IS 'Record creation timestamp';
COMMENT ON COLUMN attraction_date_prices.updated_at IS 'Record last update timestamp';
