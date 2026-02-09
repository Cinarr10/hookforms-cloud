<p align="center">
  <img src="logo.png" alt="HookForms Cloud" width="120">
</p>

<h1 align="center">HookForms Cloud</h1>

<p align="center">One-click deployable webhook inbox with multi-channel notifications — runs entirely on Cloudflare Workers. Send form submissions to Discord, Slack, Teams, Telegram, email, and more. No servers, no Docker, no VPS needed.</p>

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/h1n054ur/hookforms-cloud)

> This is the Cloudflare-native sister project of [hookforms](https://github.com/h1n054ur/hookforms) (the self-hosted Docker Compose version).

## How It Works

```
HTML Form  -->  POST /hooks/contact-form  -->  Cloudflare Worker  -->  Discord, Slack, Email, ...
```

Your form data hits a Cloudflare Worker, gets stored in D1, and notifications fire to all configured channels (Discord, Slack, email, etc.). Everything runs on Cloudflare's edge — no origin server.

## Architecture

| Component | Cloudflare Service | Purpose |
|---|---|---|
| API | Workers | HTTP handling, routing, notification dispatch |
| Database | D1 | Inboxes, events, API keys, channels, providers |
| Rate Limiting | KV | Per-IP request counters |
| Email Queue | Queues | Async email delivery |
| Token Storage | R2 | Gmail OAuth persistence |

## Quick Start

### One-Click Deploy

Click the button above, or:

```bash
git clone https://github.com/h1n054ur/hookforms-cloud.git
cd hookforms-cloud
bun install

# Create resources
bunx wrangler d1 create hookforms-db
bunx wrangler kv namespace create RATE_LIMIT
# Paste the IDs into wrangler.jsonc

# Set admin key
bunx wrangler secret put ADMIN_API_KEY

# Deploy
bun run deploy

# Run migrations (includes notification channels tables)
bun run db:migrate
```

### Gmail Setup

1. Create OAuth credentials at [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Get a refresh token (use the `gmail_auth.py` script from the [main hookforms repo](https://github.com/h1n054ur/hookforms))
3. Upload secrets:

```bash
bunx wrangler secret put GMAIL_CLIENT_ID
bunx wrangler secret put GMAIL_CLIENT_SECRET
bunx wrangler secret put GMAIL_REFRESH_TOKEN
bunx wrangler secret put GMAIL_SENDER_EMAIL
```

## Usage

### Create an inbox

```bash
curl -X POST https://hookforms.YOUR_SUBDOMAIN.workers.dev/v1/hooks/inboxes \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "slug": "contact-form",
    "notify_email": "you@gmail.com",
    "email_subject_prefix": "[Website]",
    "sender_name": "My Website"
  }'
```

### Point your form at it

```html
<form action="https://hookforms.YOUR_SUBDOMAIN.workers.dev/hooks/contact-form" method="POST">
  <input type="text" name="name" required>
  <input type="email" name="email" required>
  <textarea name="message" required></textarea>
  <button type="submit">Send</button>
</form>
```

### Add notification channels

```bash
# Send to Discord (auto-detected from URL)
curl -X POST https://hookforms.YOUR_SUBDOMAIN.workers.dev/v1/hooks/inboxes/contact-form/channels \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "webhook", "config": {"url": "https://discord.com/api/webhooks/123/abc"}}'

# Send email via configured provider
curl -X POST https://hookforms.YOUR_SUBDOMAIN.workers.dev/v1/hooks/inboxes/contact-form/channels \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "email", "config": {"recipients": ["team@example.com"]}}'
```

Channel types are auto-detected from the URL. Supported: **Discord**, **Slack**, **Microsoft Teams**, **Telegram**, **ntfy**, **Webhook** (generic), and **Email**.

### Email providers

Configure a global email provider or override per-inbox. Supported: **Gmail** (OAuth), **Resend**, **SendGrid**.

```bash
curl -X PUT https://hookforms.YOUR_SUBDOMAIN.workers.dev/v1/hooks/config/email-provider \
  -H "X-API-Key: YOUR_ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{"type": "resend", "config": {"api_key": "re_..."}}'
```

If no provider is configured, HookForms falls back to Gmail via environment secrets (the v1 behavior).

## API Reference

Same API surface as [hookforms](https://github.com/h1n054ur/hookforms#api-reference).

### Public (no auth)

| Method | Path | Description |
|--------|------|-------------|
| `GET/POST/PUT/PATCH/DELETE` | `/hooks/{slug}` | Receive a webhook event |
| `GET` | `/health` | Health check |

### Authenticated (X-API-Key header)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/v1/hooks/inboxes` | List inboxes |
| `POST` | `/v1/hooks/inboxes` | Create inbox |
| `PATCH` | `/v1/hooks/inboxes/{slug}` | Update inbox |
| `DELETE` | `/v1/hooks/inboxes/{slug}` | Delete inbox |
| `GET` | `/v1/hooks/{slug}/events` | List events |
| `POST` | `/v1/hooks/inboxes/{slug}/channels` | Add notification channel |
| `GET` | `/v1/hooks/inboxes/{slug}/channels` | List channels |
| `PATCH` | `/v1/hooks/inboxes/{slug}/channels/{id}` | Update channel |
| `DELETE` | `/v1/hooks/inboxes/{slug}/channels/{id}` | Remove channel |
| `GET` | `/v1/hooks/config/email-provider` | Get email provider config |
| `PUT` | `/v1/hooks/config/email-provider` | Set email provider |
| `DELETE` | `/v1/hooks/config/email-provider` | Remove email provider |
| `POST` | `/v1/auth/keys` | Create API key (admin) |
| `GET` | `/v1/auth/keys` | List API keys (admin) |
| `DELETE` | `/v1/auth/keys/{id}` | Revoke API key (admin) |

## Cost

Workers Free plan gets you 100k requests/day. Workers Paid ($5/mo) gives you 10M requests/month plus D1, KV, Queues, and R2 with generous free tiers. For a webhook form backend, you'll likely stay within free tier usage.

## License

[MIT](LICENSE)
