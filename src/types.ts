export interface Env {
  DB: D1Database;
  RATE_LIMIT: KVNamespace;
  STORAGE: R2Bucket;
  EMAIL_QUEUE: Queue;
  ADMIN_API_KEY: string;
  GMAIL_CLIENT_ID?: string;
  GMAIL_CLIENT_SECRET?: string;
  GMAIL_REFRESH_TOKEN?: string;
  GMAIL_SENDER_EMAIL?: string;
}

export interface ApiKey {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string;
  is_active: number;
  last_used_at: string | null;
  created_at: string;
}

export interface Inbox {
  id: string;
  slug: string;
  description: string | null;
  forward_url: string | null;
  notify_email: string | null;
  email_subject_prefix: string | null;
  sender_name: string | null;
  turnstile_secret: string | null;
  is_active: number;
  created_at: string;
}

export interface WebhookEvent {
  id: string;
  inbox_id: string;
  method: string;
  headers: string;
  body: string | null;
  query_params: string;
  source_ip: string | null;
  received_at: string;
}

export interface EmailJob {
  to: string;
  subject: string;
  body: string;
  sender_name?: string;
}
