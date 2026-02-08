import { Context, Next } from 'hono';
import type { Env } from '../types';

const WINDOW_SECONDS = 60;
const LIMIT = 100;

function getClientIp(c: Context): string {
  return (
    c.req.header('CF-Connecting-IP') ||
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ||
    '0.0.0.0'
  );
}

/**
 * Rate limiter using Cloudflare KV with sliding window approximation.
 */
export async function rateLimitMiddleware(
  c: Context<{ Bindings: Env }>,
  next: Next,
) {
  const path = new URL(c.req.url).pathname;
  if (path === '/health') return next();

  const ip = getClientIp(c);
  const key = `rl:${ip}`;

  try {
    const current = await c.env.RATE_LIMIT.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= LIMIT) {
      return c.json(
        { error: { code: 429, message: 'Too many requests. Please retry later.' } },
        429,
      );
    }

    // Increment (fire-and-forget for performance)
    c.executionCtx.waitUntil(
      c.env.RATE_LIMIT.put(key, String(count + 1), {
        expirationTtl: WINDOW_SECONDS,
      }),
    );

    c.header('X-RateLimit-Limit', String(LIMIT));
    c.header('X-RateLimit-Remaining', String(Math.max(0, LIMIT - count - 1)));
  } catch {
    // KV unavailable — allow request through
  }

  // Security headers
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('X-XSS-Protection', '1; mode=block');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  return next();
}
