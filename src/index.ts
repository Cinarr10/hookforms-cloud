import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Env, EmailJob } from './types';
import { rateLimitMiddleware } from './middleware/rate-limit';
import { webhooks, publicWebhooks } from './routes/webhooks';
import { auth } from './routes/auth';
import { sendEmail } from './services/gmail';

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

  // Queue consumer: send emails
  async queue(batch: MessageBatch<EmailJob>, env: Env): Promise<void> {
    for (const msg of batch.messages) {
      try {
        const job = msg.body;
        await sendEmail(env, job.to, job.subject, job.body, job.sender_name);
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
