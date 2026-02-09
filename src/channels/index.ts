// Base types
export type { ChannelPayload, ChannelContext } from './base';

// Individual adapters
export { buildDiscordPayload } from './discord';
export { buildSlackPayload } from './slack';
export { buildTeamsPayload } from './teams';
export { buildTelegramPayload } from './telegram';
export { buildNtfyPayload } from './ntfy';
export { buildWebhookPayload } from './webhook';
export { buildEmailPayload } from './email';
export type { EmailPayload } from './email';

// Detection, validation, and dispatching
export { detectChannelType } from './detect';
export { validateChannelConfig, validateProviderConfig, suggestChannelType } from './validate';
export { dispatchNotifications } from './dispatcher';
