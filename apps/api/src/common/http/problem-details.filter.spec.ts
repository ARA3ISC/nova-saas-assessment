import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ProblemDetailsFilter } from './problem-details.filter';

describe('ProblemDetailsFilter', () => {
  it('returns stable safe problem details with the correlation identifier', () => {
    const json = vi.fn();
    const type = vi.fn().mockReturnValue({ json });
    const status = vi.fn().mockReturnValue({ type });
    const request = {
      correlationId: 'request-12345678',
      method: 'PATCH',
      path: '/organizations/example',
    };
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ status }),
      }),
    };

    new ProblemDetailsFilter().catch(new ConflictException('Refresh and retry'), host as never);

    expect(status).toHaveBeenCalledWith(409);
    expect(type).toHaveBeenCalledWith('application/problem+json');
    expect(json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 409,
        code: 'NOVA_HTTP_409',
        detail: 'Refresh and retry',
        correlationId: 'request-12345678',
      }),
    );
  });
});
