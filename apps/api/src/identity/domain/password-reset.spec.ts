import { describe, expect, it } from 'vitest';

import { generatePasswordResetToken, hashPasswordResetToken } from './password-reset';

describe('password reset domain', () => {
  it('generates a token', () => {
    const token = generatePasswordResetToken();

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('generates different tokens', () => {
    expect(generatePasswordResetToken()).not.toBe(generatePasswordResetToken());
  });

  it('hashes a token deterministically', () => {
    const token = generatePasswordResetToken();

    expect(hashPasswordResetToken(token)).toBe(hashPasswordResetToken(token));
  });

  it('does not expose the raw token in the hash', () => {
    const token = generatePasswordResetToken();
    const hash = hashPasswordResetToken(token);

    expect(hash).not.toContain(token);
    expect(hash).toHaveLength(64);
  });
});
