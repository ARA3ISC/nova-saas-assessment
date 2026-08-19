import { Injectable } from '@nestjs/common';
import {
  generatePasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_MS,
} from '../domain/password-reset';
import { normalizeEmail } from '../../auth/domain/email';
import { PrismaService } from '../../prisma/prisma.service';
import { NotificationService } from '../../notifications/application/notification.service';
import { PasswordResetService } from './password-reset.service';
import { AuthThrottleService } from '../../auth/application/auth.throttle';

export const PASSWORD_RESET_MINIMUM_RESPONSE_MS = 250;

@Injectable()
export class PasswordResetHttpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationService,
    private readonly resets: PasswordResetService,
    private readonly throttle: AuthThrottleService,
  ) {}
  async request(email: string, sourceBucket: string): Promise<void> {
    const startedAt = Date.now();
    try {
      const normalizedEmail = normalizeEmail(email);
      if (await this.throttle.isLocked(normalizedEmail, sourceBucket, 'password-reset')) return;
      await this.throttle.recordFailure(normalizedEmail, sourceBucket, 'password-reset');
      const token = generatePasswordResetToken();
      const result = await this.prisma.$transaction(async (tx) => {
        const identity = await tx.identity.findUnique({
          where: { normalizedEmail },
          select: {
            id: true,
            email: true,
            status: true,
            membership: { select: { organizationId: true } },
            platformPrincipal: { select: { id: true } },
            passwordCredential: { select: { id: true } },
          },
        });
        if (
          !identity?.passwordCredential ||
          identity.status !== 'ACTIVE' ||
          (!identity.membership && !identity.platformPrincipal)
        )
          return null;
        await tx.passwordResetToken.updateMany({
          where: { identityId: identity.id, consumedAt: null, invalidatedAt: null },
          data: { invalidatedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: {
            identityId: identity.id,
            tokenHash: hashPasswordResetToken(token),
            expiresAt: new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS),
          },
        });
        return this.notifications.enqueuePasswordReset(tx, {
          organizationId: identity.membership?.organizationId ?? null,
          recipient: identity.email,
          token,
        });
      });
      // Delivery is deliberately outside the public request path. The durable
      // outbox retains the message if this best-effort dispatch is interrupted.
      if (result) void this.notifications.deliver(result.id).catch(() => undefined);
    } finally {
      const remaining = PASSWORD_RESET_MINIMUM_RESPONSE_MS - (Date.now() - startedAt);
      if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
    }
  }
  async complete(token: string, password: string): Promise<boolean> {
    return this.resets.resetPassword(token, password);
  }
}
