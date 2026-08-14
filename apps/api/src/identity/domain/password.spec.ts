import { describe, expect, it } from 'vitest';

import {
  hashPassword,
  validatePassword,
  verifyPassword,
} from './password';

describe('password domain', () => {
  it('rejects passwords shorter than 15 Unicode characters', () => {
    expect(() => validatePassword('short-password')).toThrow(
      'Password must contain at least 15 characters',
    );
  });

  it('accepts a password with exactly 15 Unicode characters', () => {
    expect(() => validatePassword('123456789012345')).not.toThrow();
  });

  it('counts Unicode characters rather than UTF-16 code units', () => {
    expect(() => validatePassword('😀😀😀😀😀😀😀😀')).toThrow();
    expect(() => validatePassword('😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀')).not.toThrow();
  });

  it('hashes passwords using Argon2id', async () => {
    const hash = await hashPassword('a-secure-password-123');

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(hash).toContain('m=19456');
    expect(hash).toContain('t=2');
    expect(hash).toContain('p=1');
  });

  it('verifies the correct password', async () => {
    const password = 'a-secure-password-123';
    const hash = await hashPassword(password);

    await expect(verifyPassword(password, hash)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hash = await hashPassword('a-secure-password-123');

    await expect(
      verifyPassword('wrong-password-123', hash),
    ).resolves.toBe(false);
  });

  it('generates a different hash for the same password', async () => {
    const password = 'a-secure-password-123';

    const first = await hashPassword(password);
    const second = await hashPassword(password);

    expect(first).not.toBe(second);
  });
});

