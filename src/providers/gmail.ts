import type { EmailProvider } from './base';
import type { GmailProviderConfig } from '../types';

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

/**
 * Gmail email provider using OAuth2 refresh token flow.
 * Works with both stored config (from email_providers table) and
 * environment secrets (legacy fallback).
 */
export class GmailProvider implements EmailProvider {
  readonly type = 'gmail';

  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private senderEmail: string;

  constructor(config: GmailProviderConfig) {
    this.clientId = config.client_id;
    this.clientSecret = config.client_secret;
    this.refreshToken = config.refresh_token;
    this.senderEmail = config.sender_email;
  }

  /**
   * Create a GmailProvider from environment secrets (legacy path).
   * Returns null if Gmail is not configured in env.
   */
  static fromEnv(env: {
    GMAIL_CLIENT_ID?: string;
    GMAIL_CLIENT_SECRET?: string;
    GMAIL_REFRESH_TOKEN?: string;
    GMAIL_SENDER_EMAIL?: string;
  }): GmailProvider | null {
    if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REFRESH_TOKEN) {
      return null;
    }
    return new GmailProvider({
      client_id: env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      sender_email: env.GMAIL_SENDER_EMAIL || 'noreply@example.com',
    });
  }

  private async getAccessToken(): Promise<string> {
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Gmail token refresh failed: ${resp.status} ${text}`);
    }

    const data = (await resp.json()) as TokenResponse;
    return data.access_token;
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    senderName?: string,
  ): Promise<void> {
    const accessToken = await this.getAccessToken();
    const displayName = senderName || 'HookForms';

    // Build RFC 2822 message
    const message = [
      `From: ${displayName} <${this.senderEmail}>`,
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
}
