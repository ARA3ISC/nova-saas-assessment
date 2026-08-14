import { Injectable } from '@nestjs/common';

import {
  generateSessionToken,
} from '../domain/session';
import { AuthRepository } from '../infrastructure/auth.repository';

const SESSION_TTL_MS = 1000 * 60 * 60 * 24;
const ABSOLUTE_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

@Injectable()
export class AuthService {
  constructor(private readonly authRepository: AuthRepository) {}

  async createSession(identityId: string): Promise<{
    token: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
  }> {
    const token = generateSessionToken();
    const now = new Date();

    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const absoluteExpiresAt = new Date(
      now.getTime() + ABSOLUTE_SESSION_TTL_MS,
    );

    await this.authRepository.createSession({
      identityId,
      token,
      expiresAt,
      absoluteExpiresAt,
      recentAuthenticatedAt: now,
    });

    return {
      token,
      expiresAt,
      absoluteExpiresAt,
    };
  }

  async validateSession(token: string) {
    return this.authRepository.findValidSession(token);
  }

  async revokeSession(token: string): Promise<void> {
    await this.authRepository.revokeSession(token);
  }
}
