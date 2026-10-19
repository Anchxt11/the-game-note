export interface SyncEnvelope {
  protocol_version: number;
  schema_version: number;
  sender_site_id: string;
  kind: string;
  key_id: number;
  nonce: string; // base64
  payload: string; // base64
}

export interface MailboxBatch {
  seq: number;
  device_id: string;
  created_at: number;
  size: number;
  envelope: SyncEnvelope;
}

export interface PostChangesRequest {
  device_id: string;
  envelope: SyncEnvelope;
}

export interface AckRequest {
  device_id: string;
  seq: number;
}

export interface Env {
  MAILBOX_DO: DurableObjectNamespace;
}
