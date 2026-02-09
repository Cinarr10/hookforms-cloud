import type { Env, EmailProviderRecord, GmailProviderConfig, ResendProviderConfig, SendGridProviderConfig } from '../types';
import type { EmailProvider } from './base';
import { GmailProvider } from './gmail';
import { ResendProvider } from './resend';
import { SendGridProvider } from './sendgrid';

/**
 * Resolve the email provider for a given inbox.
 *
 * Priority:
 *   1. Inbox-specific provider (email_providers row with matching inbox_id)
 *   2. Global provider (email_providers row with inbox_id = NULL)
 *   3. Legacy env-based Gmail (GMAIL_* secrets)
 *   4. null (no email provider available)
 */
export async function resolveEmailProvider(
  env: Env,
  inboxId: string,
): Promise<EmailProvider | null> {
  // 1. Try inbox-specific provider
  const specific = await env.DB.prepare(
    'SELECT * FROM email_providers WHERE inbox_id = ? AND is_active = 1 LIMIT 1',
  )
    .bind(inboxId)
    .first<EmailProviderRecord>();

  if (specific) {
    return buildProvider(specific);
  }

  // 2. Try global provider
  const global = await env.DB.prepare(
    'SELECT * FROM email_providers WHERE inbox_id IS NULL AND is_active = 1 LIMIT 1',
  ).first<EmailProviderRecord>();

  if (global) {
    return buildProvider(global);
  }

  // 3. Legacy env-based Gmail
  return GmailProvider.fromEnv(env);
}

/**
 * Instantiate a provider from a database record.
 */
function buildProvider(record: EmailProviderRecord): EmailProvider {
  const config = JSON.parse(record.config);

  switch (record.type) {
    case 'gmail':
      return new GmailProvider(config as GmailProviderConfig);
    case 'resend':
      return new ResendProvider(config as ResendProviderConfig);
    case 'sendgrid':
      return new SendGridProvider(config as SendGridProviderConfig);
    default:
      throw new Error(`Unknown email provider type: ${record.type}`);
  }
}
