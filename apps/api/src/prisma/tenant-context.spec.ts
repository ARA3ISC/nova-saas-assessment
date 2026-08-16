import { describe, expect, it } from 'vitest';

import {
  validateTenantContext,
} from './tenant-context';

describe('tenant context', () => {
  it('accepts a valid context', () => {
    expect(() =>
      validateTenantContext({
        organizationId: 'organization-id',
        actorId: 'actor-id',
        accessEpoch: 0,
      }),
    ).not.toThrow();
  });

  it('rejects a missing organization id', () => {
    expect(() =>
      validateTenantContext({
        organizationId: '',
        actorId: 'actor-id',
        accessEpoch: 0,
      }),
    ).toThrow();
  });

  it('rejects a missing actor id', () => {
    expect(() =>
      validateTenantContext({
        organizationId: 'organization-id',
        actorId: '',
        accessEpoch: 0,
      }),
    ).toThrow();
  });

  it('rejects a non-integer access epoch', () => {
    expect(() =>
      validateTenantContext({
        organizationId: 'organization-id',
        actorId: 'actor-id',
        accessEpoch: 1.5,
      }),
    ).toThrow();
  });

  it('rejects a negative access epoch', () => {
    expect(() =>
      validateTenantContext({
        organizationId: 'organization-id',
        actorId: 'actor-id',
        accessEpoch: -1,
      }),
    ).toThrow();
  });
});
