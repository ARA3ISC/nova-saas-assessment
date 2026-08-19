import { describe, expect, it, vi } from 'vitest';

import { InitialOwnerAcceptanceService } from '../application/initial-owner-acceptance.service';
import { InitialOwnerAcceptanceController } from './initial-owner-acceptance.controller';

describe('InitialOwnerAcceptanceController', () => {
  it('returns a neutral refusal for an unusable invitation', async () => {
    const service = {
      accept: vi.fn().mockResolvedValue(null),
    } as unknown as InitialOwnerAcceptanceService;
    const controller = new InitialOwnerAcceptanceController(service);

    await expect(
      controller.accept({ token: 'invalid-token', password: 'a-long-password' }),
    ).resolves.toEqual({ accepted: false });
  });

  it('confirms a successful account activation without returning a credential', async () => {
    const service = {
      accept: vi.fn().mockResolvedValue({ organizationId: 'organization-id' }),
    } as unknown as InitialOwnerAcceptanceService;
    const controller = new InitialOwnerAcceptanceController(service);

    await expect(
      controller.accept({ token: 'invitation-token', password: 'a-long-password' }),
    ).resolves.toEqual({ accepted: true });
  });
});
