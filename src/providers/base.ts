/**
 * Common interface for all email providers.
 * Each provider implements sendEmail() using its own API/protocol.
 */
export interface EmailProvider {
  readonly type: string;
  sendEmail(
    to: string,
    subject: string,
    htmlBody: string,
    senderName?: string,
  ): Promise<void>;
}

/**
 * Options passed when constructing a provider from stored config.
 */
export interface ProviderConfig {
  [key: string]: unknown;
}
