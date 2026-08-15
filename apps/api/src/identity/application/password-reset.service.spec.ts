import { describe, expect, it, vi } from 'vitest';

import { PasswordResetService } from './password-reset.service';
import { PasswordResetRepository } from '../infrastructure/password-reset.repository';

describe('PasswordResetService', () => {
  it('invalidates existing tokens and creates a new token', async () => {
    const repository = {
      invalidateForIdentity: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(undefined),
    } as unknown as PasswordResetRepository;

    const service = new PasswordResetService(repository);

    const token = await service.createToken('identity-id');

    expect(token).toBeTruthy();

    expect(repository.invalidateForIdentity).toHaveBeenCalledWith(
      'identity-id',
    );

    expect(repository.create).toHaveBeenCalledWith(
      'identity-id',
      expect.any(String),
      expect.any(Date),
    );
  });

	it('consumes a valid token', async () => {
		const repository = {
			findValidToken: vi.fn().mockResolvedValue({
				id: 'reset-token-id',
			}),
			consume: vi.fn().mockResolvedValue(undefined),
		} as unknown as PasswordResetRepository;

		const service = new PasswordResetService(repository);

		const result = await service.consumeToken('raw-token');

		expect(result).toBe(true);
		expect(repository.findValidToken).toHaveBeenCalledWith(
			expect.any(String),
			expect.any(Date),
		);
		expect(repository.consume).toHaveBeenCalledWith('reset-token-id');
	});

	it('rejects an invalid or expired token', async () => {
		const repository = {
			findValidToken: vi.fn().mockResolvedValue(null),
			consume: vi.fn(),
		} as unknown as PasswordResetRepository;

		const service = new PasswordResetService(repository);

		const result = await service.consumeToken('invalid-token');

		expect(result).toBe(false);
		expect(repository.consume).not.toHaveBeenCalled();
	});

	it('resets the password with a valid token', async () => {
		const repository = {
			findValidToken: vi.fn().mockResolvedValue({
				id: 'reset-token-id',
				identityId: 'identity-id',
			}),
			updatePassword: vi.fn().mockResolvedValue(undefined),
			consume: vi.fn().mockResolvedValue(undefined),
		} as unknown as PasswordResetRepository;

		const service = new PasswordResetService(repository);

		const result = await service.resetPassword(
			'valid-token',
			'a-very-secure-password',
		);

		expect(result).toBe(true);
		expect(repository.updatePassword).toHaveBeenCalledWith(
			'identity-id',
			expect.any(String),
		);
		expect(repository.consume).toHaveBeenCalledWith('reset-token-id');
	});

	it('rejects an invalid reset token', async () => {
		const repository = {
			findValidToken: vi.fn().mockResolvedValue(null),
			updatePassword: vi.fn(),
			consume: vi.fn(),
		} as unknown as PasswordResetRepository;

		const service = new PasswordResetService(repository);

		const result = await service.resetPassword(
			'invalid-token',
			'a-very-secure-password',
		);

		expect(result).toBe(false);
		expect(repository.updatePassword).not.toHaveBeenCalled();
		expect(repository.consume).not.toHaveBeenCalled();
	});
});
