import { describe, expect, it, vi } from 'vitest';

import { OrganizationService } from '../application/organization.service';
import { OrganizationController } from './organization.controller';

describe('OrganizationController', () => {
  it('does not expose the initial owner invitation credential', async () => {
    const organizationService = {
      createOrganization: vi.fn().mockResolvedValue({
        organizationId: 'organization-id',
        invitationId: 'invitation-id',
        invitationToken: 'must-not-leak',
        expiresAt: new Date('2026-08-24T00:00:00.000Z'),
      }),
    } as unknown as OrganizationService;

    const controller = new OrganizationController(organizationService);

    await expect(
      controller.createOrganization({
        name: 'Acme Inc',
        ownerEmail: 'owner@example.com',
      }),
    ).resolves.toEqual({
      organizationId: 'organization-id',
      invitationId: 'invitation-id',
      expiresAt: new Date('2026-08-24T00:00:00.000Z'),
    });
  });
});
