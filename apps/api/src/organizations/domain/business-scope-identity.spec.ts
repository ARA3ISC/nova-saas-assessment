import { describe, expect, it } from 'vitest';

import {
  normalizeExternalIdentifier,
  normalizeScopeName,
  requireBusinessScopeType,
} from './business-scope-identity';

describe('Business Scope identity normalization', () => {
  it('normalizes Unicode, case, and repeated whitespace consistently', () => {
    expect(normalizeScopeName('  MAIN\u00a0  Café  ')).toBe('main café');
    expect(normalizeExternalIdentifier('  EVT-  001 ')).toBe('evt- 001');
  });

  it('treats an empty external identifier as absent and rejects unknown types', () => {
    expect(normalizeExternalIdentifier('   ')).toBeNull();
    expect(() => requireBusinessScopeType('UNKNOWN' as never)).toThrow(
      'Invalid Business Scope type',
    );
  });
});
