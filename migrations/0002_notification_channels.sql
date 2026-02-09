-- Add notification_channels table for multi-channel support per inbox.
-- Replaces flat forward_url / notify_email columns with a flexible channel model.

CREATE TABLE IF NOT EXISTS notification_channels (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES webhook_inboxes(id) ON DELETE CASCADE,
  type TEXT NOT NULL,  -- 'email', 'discord', 'slack', 'teams', 'telegram', 'ntfy', 'webhook'
  label TEXT,          -- optional human-readable label e.g. "Dev Discord"
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: provider-specific settings
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_channels_inbox_id ON notification_channels(inbox_id);
CREATE INDEX IF NOT EXISTS idx_channels_type ON notification_channels(type);

-- Add email_provider config table (global or per-inbox override)
CREATE TABLE IF NOT EXISTS email_providers (
  id TEXT PRIMARY KEY,
  inbox_id TEXT REFERENCES webhook_inboxes(id) ON DELETE CASCADE,  -- NULL = global default
  type TEXT NOT NULL,  -- 'gmail', 'resend', 'sendgrid', 'smtp'
  config TEXT NOT NULL DEFAULT '{}',  -- JSON: provider credentials (encrypted at rest in production)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(inbox_id)  -- max one provider per inbox (NULL inbox_id = global)
);
