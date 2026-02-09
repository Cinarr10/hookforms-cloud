export interface ChannelPayload {
  method: string;
  url: string;
  headers: Record<string, string>;
  body: string;
}

export interface ChannelContext {
  slug: string;
  subjectPrefix: string;
  senderName: string;
  body: Record<string, unknown>;
}
