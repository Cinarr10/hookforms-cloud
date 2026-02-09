import type { EmailProvider } from './base';
import type { SendGridProviderConfig } from '../types';

/**
 * SendGrid email provider (https://sendgrid.com).
 * Uses the SendGrid v3 Mail Send API.
 */
export class SendGridProvider implements EmailProvider {
  readonly type = 'sendgrid';

  private apiKey: string;
  private fromEmail: string;

  constructor(config: SendGridProviderConfig) {
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

    const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to }] }],
        from: { email: this.fromEmail, name: displayName },
        subject,
        content: [{ type: 'text/html', value: htmlBody }],
      }),
    });

    // SendGrid returns 202 on success
    if (!resp.ok && resp.status !== 202) {
      const text = await resp.text();
      throw new Error(`SendGrid send failed: ${resp.status} ${text}`);
    }
  }
}
