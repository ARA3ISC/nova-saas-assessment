import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from '../domain/password-reset';
import { PasswordResetRepository } from '../infrastructure/password-reset.repository';

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export class PasswordResetService {
  constructor(
    private readonly repository: PasswordResetRepository,
  ) {}

  async createToken(identityId: string): Promise<string> {
    const token = generatePasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);

    await this.repository.invalidateForIdentity(identityId);

    await this.repository.create(
      identityId,
      tokenHash,
      new Date(Date.now() + RESET_TOKEN_TTL_MS),
    );

    return token;
  }

	async consumeToken(token: string): Promise<boolean> {
		const tokenHash = hashPasswordResetToken(token);

		const record = await this.repository.findValidToken(
			tokenHash,
			new Date(),
		);

		if (!record) {
			return false;
		}

		await this.repository.consume(record.id);

		return true;
	}
}
