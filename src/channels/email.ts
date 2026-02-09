import type { EmailChannelConfig } from '../types';

/**
 * Email channel adapter
 * Returns a special marker for the dispatcher to route to email queue
 * This adapter doesn't return a ChannelPayload since email is handled differently
 */
export interface EmailPayload {
  type: 'email';
  recipients: string[];
}

export function buildEmailPayload(
  config: EmailChannelConfig,
): EmailPayload {
  return {
    type: 'email',
    recipients: config.recipients,
  };
}
