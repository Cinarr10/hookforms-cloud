import type { ChannelType } from '../types';

/**
 * Auto-detects the channel type based on URL patterns
 * Used when a generic 'webhook' channel needs to be routed to a specific adapter
 */
export function detectChannelType(url: string): ChannelType {
  const lowerUrl = url.toLowerCase();

  if (lowerUrl.includes('discord.com/api/webhooks')) {
    return 'discord';
  }

  if (lowerUrl.includes('hooks.slack.com/')) {
    return 'slack';
  }

  if (lowerUrl.includes('webhook.office.com') || lowerUrl.includes('logic.azure.com')) {
    return 'teams';
  }

  if (lowerUrl.includes('api.telegram.org/bot')) {
    return 'telegram';
  }

  if (lowerUrl.includes('ntfy.sh/')) {
    return 'ntfy';
  }

  // Default to generic webhook
  return 'webhook';
}
