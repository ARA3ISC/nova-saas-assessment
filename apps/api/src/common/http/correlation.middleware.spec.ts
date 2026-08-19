import { describe, expect, it, vi } from 'vitest';
import { CorrelationMiddleware } from './correlation.middleware';

describe('CorrelationMiddleware', () => {
  it('preserves a safe caller correlation identifier', () => {
    const request = { header: vi.fn().mockReturnValue('browser-request-123') };
    const response = { setHeader: vi.fn() };
    const next = vi.fn();

    new CorrelationMiddleware().use(request as never, response as never, next);

    expect(request).toMatchObject({ correlationId: 'browser-request-123' });
    expect(response.setHeader).toHaveBeenCalledWith('X-Correlation-Id', 'browser-request-123');
    expect(next).toHaveBeenCalledOnce();
  });

  it('replaces unsafe correlation input with a server-generated identifier', () => {
    const request = { header: vi.fn().mockReturnValue('bad value\nheader') };
    const response = { setHeader: vi.fn() };

    new CorrelationMiddleware().use(request as never, response as never, vi.fn());

    expect((request as { correlationId?: string }).correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f-]{27}$/,
    );
  });
});
