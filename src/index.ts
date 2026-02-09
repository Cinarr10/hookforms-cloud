import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, EmailJob } from './types';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { webhooks, publicWebhooks } from './routes/webhooks';
import { auth } from './routes/auth';
import { channels } from './routes/channels';
import { resolveEmailProvider, GmailProvider } from './providers';

const app = new Hono<{ Bindings: Env }>();

// CORS
app.use('*', cors());

// Rate limiting + security headers
app.use('*', rateLimitMiddleware);

// Root
app.get('/', (c) =>
  c.json({ name: 'HookForms', status: 'ok', version: '0.1.0' }),
);

// Health check
app.get('/health', async (c) => {
  let dbStatus = 'ok';
  try {
    await c.env.DB.prepare('SELECT 1').first();
  } catch {
    dbStatus = 'unavailable';
  }

  return c.json({
    status: dbStatus === 'ok' ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    version: '0.1.0',
    checks: { d1: dbStatus },
  });
});

// Public webhook receiver (no auth)
app.route('/', publicWebhooks);

// Authenticated routes
app.route('/v1/hooks', webhooks);
app.route('/v1/hooks', channels);  // /v1/hooks/inboxes/:slug/channels
app.route('/v1', channels);        // /v1/config/email-provider
app.route('/v1/auth', auth);

// 404
app.notFound((c) =>
  c.json({ error: { code: 404, message: 'Not found' } }, 404),
);

// Error handler
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: { code: 500, message: 'Internal server error' } }, 500);
});

export default {
  fetch: app.fetch,

  // Queue consumer: send emails via resolved provider
  async queue(batch: MessageBatch<EmailJob>, env: Env): Promise<void> {
    // Cache providers per inbox to avoid repeated DB lookups within a batch
    const providerCache = new Map<string, Awaited<ReturnType<typeof resolveEmailProvider>>>();

    for (const msg of batch.messages) {
      try {
        const job = msg.body;

        // Resolve provider: inbox-specific -> global -> env Gmail
        const cacheKey = job.inbox_id || '__env__';
        let provider = providerCache.get(cacheKey);
        if (provider === undefined) {
          provider = job.inbox_id
            ? await resolveEmailProvider(env, job.inbox_id)
            : GmailProvider.fromEnv(env);
          providerCache.set(cacheKey, provider);
        }

        if (!provider) {
          console.error(`No email provider available for inbox ${job.inbox_id || 'env'}`);
          msg.ack(); // Don't retry if no provider configured
          continue;
        }

        await provider.sendEmail(job.to, job.subject, job.body, job.sender_name);
        msg.ack();
      } catch (err) {
        console.error('Email send failed:', err);
        msg.retry();
      }
    }
  },

  // Scheduled: cleanup old events (daily at 3am UTC)
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    try {
      const result = await env.DB.prepare(
        'DELETE FROM webhook_events WHERE received_at < ?',
      )
        .bind(cutoff.toISOString())
        .run();

      console.log(`Cleaned up ${result.meta.changes} old webhook events`);
    } catch (err) {
      console.error('Event cleanup failed:', err);
    }
  },
};
