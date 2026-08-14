import { describe, expect, it } from 'vitest';

import {
  generateSessionToken,
  hashSessionToken,
} from './session';

describe('session tokens', () => {
  it('generates a non-empty opaque token', () => {
    const token = generateSessionToken();

    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('generates unique tokens', () => {
    expect(generateSessionToken()).not.toBe(generateSessionToken());
  });

  it('hashes tokens deterministically', () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
  });

  it('does not return the original token as its hash', () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).not.toBe(token);
  });
});
