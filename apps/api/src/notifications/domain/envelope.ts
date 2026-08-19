import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

type InitialOwnerEnvelope = { token: string };

function encryptionKey(): Buffer {
  const value = process.env.EMAIL_ENCRYPTION_KEY?.trim();

  if (!value) {
    throw new Error('EMAIL_ENCRYPTION_KEY is required');
  }

  const key = Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error('EMAIL_ENCRYPTION_KEY must be a base64-encoded 32-byte key');
  }

  return key;
}

export function encryptInitialOwnerEnvelope(envelope: InitialOwnerEnvelope): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(envelope), 'utf8'),
    cipher.final(),
  ]);

  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}

export function decryptInitialOwnerEnvelope(value: string): InitialOwnerEnvelope {
  const payload = Buffer.from(value, 'base64url');
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');

  return JSON.parse(plaintext) as InitialOwnerEnvelope;
}
