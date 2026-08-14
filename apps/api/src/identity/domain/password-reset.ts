import { createHash, randomBytes } from 'node:crypto';

const TOKEN_BYTES = 32;

export function generatePasswordResetToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
