import { describe, expect, it } from 'vitest';

import { loadDatabaseConfig, loadServerConfig } from './api.config';

describe('api config', () => {
  it('loads server config with defaults', () => {
    expect(loadServerConfig()).toEqual({
      host: '127.0.0.1',
      port: 3001,
    });
  });

  it('requires DATABASE_URL for database config', () => {
    const original = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;

    expect(() => loadDatabaseConfig()).toThrow('Missing required environment variable: DATABASE_URL');

    if (original === undefined) {
      delete process.env.DATABASE_URL;
    } else {
      process.env.DATABASE_URL = original;
    }
  });
});
