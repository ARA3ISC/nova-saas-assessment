import { AuthThrottleService } from './auth.throttle';
import { Injectable } from '@nestjs/common';
import { normalizeEmail } from '../domain/email';
import * as argon2 from 'argon2';
import { hashPassword } from '../../identity/domain/password';

import { generateSessionToken } from '../domain/session';
import { AuthRepository } from '../infrastructure/auth.repository';

const SESSION_TTL_MS = 30 * 60 * 1000;
const ABSOLUTE_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const TIMING_EQUALIZER_HASH =
  '$argon2id$v=19$m=19456,p=1,t=2$s3+6LGp1YqdsuFKSO87dOA$hluUu/kQ1U8TweMP+4Ym5mPaLWulcXeW95aHbnquFlQ';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly authThrottle: AuthThrottleService,
  ) {}

  async createSession(identityId: string): Promise<{
    token: string;
    expiresAt: Date;
    absoluteExpiresAt: Date;
  }> {
    const token = generateSessionToken();
    const now = new Date();

    const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
    const absoluteExpiresAt = new Date(now.getTime() + ABSOLUTE_SESSION_TTL_MS);

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

  async getIdentityContext(identityId: string) {
    return this.authRepository.findIdentityContext(identityId);
  }

  async login(email: string, password: string, sourceBucket: string) {
    const normalizedEmail = normalizeEmail(email);

    if (await this.authThrottle.isLocked(normalizedEmail, sourceBucket)) {
      await argon2.verify(TIMING_EQUALIZER_HASH, password).catch(() => false);
      return null;
    }

    const identity = await this.authRepository.findIdentityByEmail(normalizedEmail);

    if (!identity || identity.status !== 'ACTIVE' || !identity.passwordCredential) {
      await argon2.verify(TIMING_EQUALIZER_HASH, password).catch(() => false);
      await this.authThrottle.recordFailure(normalizedEmail, sourceBucket);
      return null;
    }

    const valid = await argon2.verify(identity.passwordCredential.passwordHash, password);

    if (!valid) {
      await this.authThrottle.recordFailure(normalizedEmail, sourceBucket);
      return null;
    }

    // A legitimate login clears only that account's failures. Shared source
    // failures remain independent and expire through their own time window.
    await this.authThrottle.clearAccountFailures(normalizedEmail);

    return {
      ...(await this.createSession(identity.id)),
      mustChangePassword: identity.passwordCredential.mustChangePassword,
    };
  }

  async completeRequiredPasswordChange(identityId: string, password: string) {
    const passwordHash = await hashPassword(password);
    const changed = await this.authRepository.completeRequiredPasswordChange(
      identityId,
      passwordHash,
    );
    if (!changed) return null;
    return this.createSession(identityId);
  }
}
