-- Create page_seo table for centralized SEO management per slug
CREATE TABLE IF NOT EXISTS page_seo (
    id SERIAL PRIMARY KEY,
    slug VARCHAR(255) NOT NULL UNIQUE,
    meta_title VARCHAR(500),
    meta_description TEXT,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert the default entry (for pages without a custom SEO entry)
INSERT INTO page_seo (slug, meta_title, meta_description)
VALUES ('default', 'Snow City Bangalore | Best indoor snow theme park of India', 'SnowCity: Attractions, combos, offers, and online ticket booking. Explore the coolest experiences in the city with seamless checkout.')
ON CONFLICT (slug) DO NOTHING;
