import type { TelegramChannelConfig } from '../types';
import type { ChannelPayload, ChannelContext } from './base';
import { formatValue } from '../services/format-value';

/**
 * Telegram channel adapter
 * Formats messages as HTML for Telegram sendMessage API
 */
export function buildTelegramPayload(
  config: TelegramChannelConfig,
  context: ChannelContext,
): ChannelPayload {
  // Filter out sensitive/internal fields
  const filteredBody = Object.entries(context.body)
    .filter(([k]) => k !== 'cf-turnstile-response' && k !== 'raw');

  // Build HTML formatted text
  const title = `<b>${context.subjectPrefix} New Submission</b>`;
  const fields = filteredBody
    .map(([k, v]) => {
      const fieldName = k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      return `<b>${fieldName}:</b> ${formatValue(v)}`;
    })
    .join('\n');

  const text = `${title}\n\n${fields}`;

  const payload = {
    chat_id: config.chat_id,
    text,
    parse_mode: 'HTML',
  };

  return {
    method: 'POST',
    url: config.bot_url,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  };
}
