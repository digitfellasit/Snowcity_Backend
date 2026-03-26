CREATE TABLE IF NOT EXISTS consolidated_namings (
    id SERIAL PRIMARY KEY,
    product_type VARCHAR(255) NOT NULL,
    price_card_name VARCHAR(255) NOT NULL,
    product_name VARCHAR(255) NOT NULL,
    ref_price DECIMAL(10, 2) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for faster lookups
CREATE INDEX idx_consolidated_namings_price_card ON consolidated_namings(price_card_name);
