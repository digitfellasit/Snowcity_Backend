BEGIN;

-- Add date-specific pricing for attractions
CREATE TABLE attraction_date_prices (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    attraction_id   BIGINT NOT NULL REFERENCES attractions(attraction_id) ON DELETE CASCADE,
    price_date      DATE NOT NULL,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_attraction_date UNIQUE (attraction_id, price_date)
);

CREATE TRIGGER trg_attraction_date_prices_updated_at
BEFORE UPDATE ON attraction_date_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_attraction_date_prices_attraction_id ON attraction_date_prices(attraction_id);
CREATE INDEX idx_attraction_date_prices_date ON attraction_date_prices(price_date);

-- Add date-specific pricing for combos
CREATE TABLE combo_date_prices (
    id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    combo_id        BIGINT NOT NULL REFERENCES combos(combo_id) ON DELETE CASCADE,
    price_date      DATE NOT NULL,
    price           NUMERIC(10,2) NOT NULL CHECK (price >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_combo_date UNIQUE (combo_id, price_date)
);

CREATE TRIGGER trg_combo_date_prices_updated_at
BEFORE UPDATE ON combo_date_prices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX idx_combo_date_prices_combo_id ON combo_date_prices(combo_id);
CREATE INDEX idx_combo_date_prices_date ON combo_date_prices(price_date);

COMMIT;
