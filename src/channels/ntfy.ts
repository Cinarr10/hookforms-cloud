import type { NtfyChannelConfig } from '../types';
import type { ChannelPayload, ChannelContext } from './base';

/**
 * Ntfy channel adapter
 * Formats messages as plain text with custom headers
 */
export function buildNtfyPayload(
  config: NtfyChannelConfig,
  context: ChannelContext,
): ChannelPayload {
  // Filter out sensitive/internal fields
  const filteredBody = Object.entries(context.body)
    .filter(([k]) => k !== 'cf-turnstile-response' && k !== 'raw');

  // Build plain text body
  const lines = filteredBody.map(([k, v]) => {
    const fieldName = k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
    return `${fieldName}: ${v}`;
  });

  const body = lines.join('\n');

  const headers: Record<string, string> = {
    'Content-Type': 'text/plain',
    Title: `${context.subjectPrefix} New Submission`,
    Tags: 'incoming_envelope',
  };

  // Add priority if specified
  if (config.priority !== undefined) {
    headers.Priority = String(config.priority);
  }

  return {
    method: 'POST',
    url: config.url,
    headers,
    body,
  };
}
