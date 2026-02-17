-- Migration: Add password reset token columns to users table
-- Date: 2026-02-16

-- Add reset_token column for storing hashed reset tokens
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token VARCHAR(255);

-- Add reset_token_expiry column for storing token expiration
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP WITH TIME ZONE;

-- Add index on reset_token for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_reset_token ON users(reset_token) WHERE reset_token IS NOT NULL;

-- Add index on reset_token_expiry for cleanup queries
CREATE INDEX IF NOT EXISTS idx_users_reset_token_expiry ON users(reset_token_expiry) WHERE reset_token_expiry IS NOT NULL;
