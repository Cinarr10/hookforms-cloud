import { Hono } from 'hono';
import type { Env, Inbox } from '../types';
import { requireScope } from '../middleware/auth';
import { verifyTurnstile } from '../services/turnstile';
import { buildEmailHtml } from '../services/email-template';

const webhooks = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// Public: receive webhooks
// ---------------------------------------------------------------------------

const publicWebhooks = new Hono<{ Bindings: Env }>();

publicWebhooks.all('/hooks/:slug', async (c) => {
  const slug = c.req.param('slug');

  const inbox = await c.env.DB.prepare(
    'SELECT * FROM webhook_inboxes WHERE slug = ? AND is_active = 1',
  )
    .bind(slug)
    .first<Inbox>();

  if (!inbox) {
    return c.json({ error: { code: 404, message: 'Inbox not found' } }, 404);
  }

  // Parse body — check content-type first to avoid consuming the stream
  let body: Record<string, unknown> | null = null;
  const contentType = c.req.header('content-type') || '';

  if (
    contentType.includes('application/x-www-form-urlencoded') ||
    contentType.includes('multipart/form-data')
  ) {
    try {
      const formData = await c.req.formData();
      body = {};
      for (const [key, val] of formData.entries()) {
        if (typeof val === 'string') body[key] = val;
      }
    } catch {
      /* fall through to raw text */
    }
  } else if (contentType.includes('application/json')) {
    try {
      body = await c.req.json();
    } catch {
      /* fall through to raw text */
    }
  } else {
    // Unknown content-type: try JSON first, then raw text
    try {
      body = await c.req.json();
    } catch {
      /* fall through to raw text */
    }
  }

  if (!body) {
    try {
      const raw = await c.req.text();
      if (raw) body = { raw };
    } catch {
      /* empty */
    }
  }

  // Turnstile verification
  if (inbox.turnstile_secret && body) {
    const token = body['cf-turnstile-response'] as string | undefined;
    delete body['cf-turnstile-response'];

    if (!token) {
      return c.json(
        { error: { code: 400, message: 'Missing Turnstile verification token' } },
        400,
      );
    }

    const ip = c.req.header('CF-Connecting-IP') || '';
    const valid = await verifyTurnstile(inbox.turnstile_secret, token, ip);
    if (!valid) {
      return c.json({ error: { code: 403, message: 'Turnstile verification failed' } }, 403);
    }
  }

  // Store event
  const eventId = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO webhook_events (id, inbox_id, method, headers, body, query_params, source_ip)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      eventId,
      inbox.id,
      c.req.method,
      JSON.stringify(Object.fromEntries(c.req.raw.headers.entries())),
      body ? JSON.stringify(body) : null,
      JSON.stringify(Object.fromEntries(new URL(c.req.url).searchParams.entries())),
      c.req.header('CF-Connecting-IP') || null,
    )
    .run();

  // Forward to URL (fire-and-forget)
  if (inbox.forward_url && body) {
    const isDiscord = inbox.forward_url.includes('discord.com/api/webhooks');
    const isSlack = inbox.forward_url.includes('hooks.slack.com/');

    let forwardBody: string;
    let forwardMethod = 'POST';

    if (isDiscord) {
      // Format as Discord embed
      const fields = Object.entries(body)
        .filter(([k, v]) => v && k !== 'cf-turnstile-response')
        .map(([k, v]) => ({
          name: k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          value: String(v).substring(0, 1024),
          inline: String(v).length < 50,
        }));
      forwardBody = JSON.stringify({
        embeds: [{
          title: `${inbox.email_subject_prefix || `[${slug}]`} New Submission`,
          color: 0xd4a843,
          fields,
          footer: { text: `hookforms/hooks/${slug}` },
          timestamp: new Date().toISOString(),
        }],
      });
    } else if (isSlack) {
      // Format as Slack message
      const lines = Object.entries(body)
        .filter(([k, v]) => v && k !== 'cf-turnstile-response')
        .map(([k, v]) => `*${k.replace(/_/g, ' ')}:* ${v}`);
      forwardBody = JSON.stringify({
        text: `${inbox.email_subject_prefix || `[${slug}]`} New Submission`,
        blocks: [{
          type: 'section',
          text: { type: 'mrkdwn', text: lines.join('\n') },
        }],
      });
    } else {
      forwardBody = JSON.stringify(body);
      forwardMethod = c.req.method;
    }

    c.executionCtx.waitUntil(
      fetch(inbox.forward_url, {
        method: forwardMethod,
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-From': `hookforms/hooks/${slug}`,
        },
        body: forwardBody,
      }).catch(() => {}),
    );
  }

  // Email notification via queue
  if (inbox.notify_email && body) {
    const prefix = inbox.email_subject_prefix || `[${slug}]`;
    const name = String(body.name || 'Unknown');
    const subjectDetail = name !== 'Unknown' ? `from ${name}` : 'New Submission';
    const htmlBody = buildEmailHtml(slug, body, inbox.sender_name ?? undefined);

    const recipients = inbox.notify_email.split(',').map((e: string) => e.trim()).filter(Boolean);

    for (const to of recipients) {
      c.executionCtx.waitUntil(
        c.env.EMAIL_QUEUE.send({
          to,
          subject: `${prefix} ${subjectDetail}`,
          body: htmlBody,
          sender_name: inbox.sender_name ?? undefined,
        }),
      );
    }
  }

  return c.json({ status: 'received', event_id: eventId });
});

// ---------------------------------------------------------------------------
// Authenticated: manage inboxes
// ---------------------------------------------------------------------------

webhooks.get('/inboxes', requireScope('webhooks'), async (c) => {
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = parseInt(c.req.query('offset') || '0');

  const total = await c.env.DB.prepare('SELECT COUNT(*) as count FROM webhook_inboxes').first<{
    count: number;
  }>();

  const results = await c.env.DB.prepare(
    'SELECT * FROM webhook_inboxes ORDER BY created_at DESC LIMIT ? OFFSET ?',
  )
    .bind(limit, offset)
    .all<Inbox>();

  const items = (results.results || []).map((i) => ({
    ...i,
    has_turnstile: !!i.turnstile_secret,
    turnstile_secret: undefined,
  }));

  return c.json({ data: items, meta: { total: total?.count || 0, limit, offset } });
});

webhooks.post('/inboxes', requireScope('webhooks'), async (c) => {
  const body = await c.req.json<{
    slug: string;
    description?: string;
    forward_url?: string;
    notify_email?: string;
    email_subject_prefix?: string;
    sender_name?: string;
    turnstile_secret?: string;
  }>();

  if (!body.slug) {
    return c.json({ error: { code: 400, message: 'slug is required' } }, 400);
  }

  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    `INSERT INTO webhook_inboxes (id, slug, description, forward_url, notify_email, email_subject_prefix, sender_name, turnstile_secret)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      body.slug,
      body.description || null,
      body.forward_url || null,
      body.notify_email || null,
      body.email_subject_prefix || null,
      body.sender_name || null,
      body.turnstile_secret || null,
    )
    .run();

  const inbox = await c.env.DB.prepare('SELECT * FROM webhook_inboxes WHERE id = ?')
    .bind(id)
    .first<Inbox>();

  return c.json(
    {
      data: {
        ...inbox,
        has_turnstile: !!inbox?.turnstile_secret,
        turnstile_secret: undefined,
      },
    },
    201,
  );
});

webhooks.patch('/inboxes/:slug', requireScope('webhooks'), async (c) => {
  const slug = c.req.param('slug');
  const body = await c.req.json<Record<string, unknown>>();

  const inbox = await c.env.DB.prepare('SELECT * FROM webhook_inboxes WHERE slug = ?')
    .bind(slug)
    .first<Inbox>();

  if (!inbox) {
    return c.json({ error: { code: 404, message: 'Inbox not found' } }, 404);
  }

  const allowed = [
    'description',
    'forward_url',
    'notify_email',
    'email_subject_prefix',
    'sender_name',
    'turnstile_secret',
    'is_active',
  ];
  const updates: string[] = [];
  const values: unknown[] = [];

  for (const field of allowed) {
    if (field in body) {
      updates.push(`${field} = ?`);
      values.push(body[field] ?? null);
    }
  }

  if (updates.length > 0) {
    values.push(slug);
    await c.env.DB.prepare(
      `UPDATE webhook_inboxes SET ${updates.join(', ')} WHERE slug = ?`,
    )
      .bind(...values)
      .run();
  }

  const updated = await c.env.DB.prepare('SELECT * FROM webhook_inboxes WHERE slug = ?')
    .bind(slug)
    .first<Inbox>();

  return c.json({
    data: {
      ...updated,
      has_turnstile: !!updated?.turnstile_secret,
      turnstile_secret: undefined,
    },
  });
});

webhooks.delete('/inboxes/:slug', requireScope('webhooks'), async (c) => {
  const slug = c.req.param('slug');

  const inbox = await c.env.DB.prepare('SELECT id FROM webhook_inboxes WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();

  if (!inbox) {
    return c.json({ error: { code: 404, message: 'Inbox not found' } }, 404);
  }

  await c.env.DB.prepare('DELETE FROM webhook_inboxes WHERE slug = ?').bind(slug).run();
  return c.body(null, 204);
});

webhooks.get('/:slug/events', requireScope('webhooks'), async (c) => {
  const slug = c.req.param('slug');
  const limit = Math.min(parseInt(c.req.query('limit') || '50'), 200);
  const offset = parseInt(c.req.query('offset') || '0');

  const inbox = await c.env.DB.prepare('SELECT id FROM webhook_inboxes WHERE slug = ?')
    .bind(slug)
    .first<{ id: string }>();

  if (!inbox) {
    return c.json({ error: { code: 404, message: 'Inbox not found' } }, 404);
  }

  const total = await c.env.DB.prepare(
    'SELECT COUNT(*) as count FROM webhook_events WHERE inbox_id = ?',
  )
    .bind(inbox.id)
    .first<{ count: number }>();

  const results = await c.env.DB.prepare(
    'SELECT * FROM webhook_events WHERE inbox_id = ? ORDER BY received_at DESC LIMIT ? OFFSET ?',
  )
    .bind(inbox.id, limit, offset)
    .all();

  const items = (results.results || []).map((e: Record<string, unknown>) => ({
    ...e,
    headers: JSON.parse(e.headers as string),
    body: e.body ? JSON.parse(e.body as string) : null,
    query_params: JSON.parse(e.query_params as string),
  }));

  return c.json({ data: items, meta: { total: total?.count || 0, limit, offset } });
});

export { webhooks, publicWebhooks };
