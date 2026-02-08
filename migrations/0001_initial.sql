-- Initial schema for HookForms on Cloudflare D1

CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT,
  scopes TEXT NOT NULL DEFAULT '[]',
  is_active INTEGER NOT NULL DEFAULT 1,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);

CREATE TABLE IF NOT EXISTS webhook_inboxes (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  forward_url TEXT,
  notify_email TEXT,
  email_subject_prefix TEXT,
  sender_name TEXT,
  turnstile_secret TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inboxes_slug ON webhook_inboxes(slug);

CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  inbox_id TEXT NOT NULL REFERENCES webhook_inboxes(id) ON DELETE CASCADE,
  method TEXT NOT NULL,
  headers TEXT NOT NULL DEFAULT '{}',
  body TEXT,
  query_params TEXT NOT NULL DEFAULT '{}',
  source_ip TEXT,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_inbox_id ON webhook_events(inbox_id);
CREATE INDEX IF NOT EXISTS idx_events_received_at ON webhook_events(received_at);
