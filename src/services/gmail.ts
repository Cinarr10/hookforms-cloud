import type { Env } from '../types';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Module-level access token cache to avoid hammering Google's OAuth endpoint.
 * Excessive token refresh requests can trigger Google to revoke the refresh token.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * Get a Gmail access token, using a cached value if still valid.
 */
async function getAccessToken(env: Env): Promise<string> {
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
    throw new Error('Gmail credentials not configured');
  }

  // Return cached token if still valid (with 5-minute safety margin)
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  const resp = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail token refresh failed: ${resp.status} ${text}`);
  }

  const data = (await resp.json()) as TokenResponse;

  // Cache with 5-minute safety margin (tokens typically last 3600s)
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + (data.expires_in - 300) * 1000,
  };

  return data.access_token;
}

/**
 * Send an email via Gmail API.
 */
export async function sendEmail(
  env: Env,
  to: string,
  subject: string,
  htmlBody: string,
  senderName?: string,
): Promise<void> {
  const accessToken = await getAccessToken(env);
  const sender = env.GMAIL_SENDER_EMAIL || 'noreply@example.com';
  const displayName = senderName || 'HookForms';

  // Build RFC 2822 message
  const message = [
    `From: ${displayName} <${sender}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    '',
    htmlBody,
  ].join('\r\n');

  // Base64url encode
  const raw = btoa(unescape(encodeURIComponent(message)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  const resp = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    },
  );

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Gmail send failed: ${resp.status} ${text}`);
  }
}
