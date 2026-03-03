-- Add announcement_active column to offers table
ALTER TABLE offers ADD COLUMN announcement_active BOOLEAN NOT NULL DEFAULT TRUE;
