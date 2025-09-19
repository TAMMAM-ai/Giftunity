-- Giftunity Database Migration 0001
-- Create users table with comprehensive Telegram User object fields
-- Date: 2025-09-19
-- Description: Initial migration to create users table capturing all Telegram User object data

CREATE TABLE users (
    -- Primary key - Telegram user ID
    id BIGINT PRIMARY KEY,
    
    -- Core Telegram User object fields
    is_bot BOOLEAN NOT NULL,
    first_name TEXT NOT NULL,
    last_name TEXT,
    username TEXT,
    language_code VARCHAR(10),
    is_premium BOOLEAN,
    added_to_attachment_menu BOOLEAN,
    can_join_groups BOOLEAN,
    can_read_all_group_messages BOOLEAN,
    supports_inline_queries BOOLEAN,
    
    -- Giftunity-specific fields
    preferred_language TEXT DEFAULT 'en',
    
    -- Standard timestamp fields
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on username for faster lookups
CREATE INDEX idx_users_username ON users(username) WHERE username IS NOT NULL;

-- Create index on preferred_language for translation queries
CREATE INDEX idx_users_preferred_language ON users(preferred_language);

-- Create index on created_at for analytics and reporting
CREATE INDEX idx_users_created_at ON users(created_at);

-- Add comments for documentation
COMMENT ON TABLE users IS 'Stores comprehensive user data from Telegram User object plus Giftunity-specific preferences';
COMMENT ON COLUMN users.id IS 'Telegram user ID - primary key';
COMMENT ON COLUMN users.is_bot IS 'Indicates if the user is a bot';
COMMENT ON COLUMN users.first_name IS 'User first name (required by Telegram)';
COMMENT ON COLUMN users.last_name IS 'User last name (optional)';
COMMENT ON COLUMN users.username IS 'Telegram username without @ (optional)';
COMMENT ON COLUMN users.language_code IS 'Telegram-detected language code (e.g., en, ar, fa)';
COMMENT ON COLUMN users.is_premium IS 'Indicates if user has Telegram Premium subscription';
COMMENT ON COLUMN users.added_to_attachment_menu IS 'Indicates if user added bot to attachment menu';
COMMENT ON COLUMN users.can_join_groups IS 'Indicates if bot can be added to groups by this user';
COMMENT ON COLUMN users.can_read_all_group_messages IS 'Indicates if bot can read all group messages';
COMMENT ON COLUMN users.supports_inline_queries IS 'Indicates if user supports inline queries';
COMMENT ON COLUMN users.preferred_language IS 'User-selected language preference for Giftunity interface';
COMMENT ON COLUMN users.created_at IS 'Timestamp when user record was first created';
COMMENT ON COLUMN users.updated_at IS 'Timestamp when user record was last updated';
