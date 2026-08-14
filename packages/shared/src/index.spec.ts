import { describe, expect, it } from 'vitest';

import { NOVA_APP_NAME, createHealthResponse } from './index';

describe('shared smoke', () => {
  it('exports the application name', () => {
    expect(NOVA_APP_NAME).toBe('nova');
  });

  it('creates a health response', () => {
    expect(createHealthResponse()).toEqual({ status: 'ok' });
  });
});
