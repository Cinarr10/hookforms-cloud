import type { EmailProvider } from './base';
import type { ResendProviderConfig } from '../types';

/**
 * Resend email provider (https://resend.com).
 * Uses the Resend REST API to send transactional email.
 */
export class ResendProvider implements EmailProvider {
  readonly type = 'resend';

  private apiKey: string;
  private fromEmail: string;

  constructor(config: ResendProviderConfig) {
    this.apiKey = config.api_key;
    this.fromEmail = config.from_email;
  }

  async sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    senderName?: string,
  ): Promise<void> {
    const displayName = senderName || 'HookForms';
    const from = `${displayName} <${this.fromEmail}>`;

    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        html: htmlBody,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(`Resend send failed: ${resp.status} ${text}`);
    }
  }
}
