import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { normalizeEmail } from '../../auth/domain/email';
import { hashPassword } from '../../identity/domain/password';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlatformBootstrapService {
  constructor(private readonly prisma: PrismaService) {}

  async bootstrap(params: {
    email: string;
    password: string;
    bootstrapToken: string;
  }): Promise<void> {
    const expected = process.env.PLATFORM_BOOTSTRAP_TOKEN?.trim();
    if (
      !expected ||
      expected.length !== params.bootstrapToken.length ||
      !timingSafeEqual(Buffer.from(expected), Buffer.from(params.bootstrapToken))
    ) {
      throw new UnauthorizedException('Bootstrap unavailable');
    }
    const passwordHash = await hashPassword(params.password);
    await this.prisma.$transaction(async (tx) => {
      const existing = await tx.platformPrincipal.findFirst({ select: { id: true } });
      if (existing) throw new ConflictException('Platform Administrator already bootstrapped');
      const identity = await tx.identity.create({
        data: {
          email: params.email.trim(),
          normalizedEmail: normalizeEmail(params.email),
          passwordCredential: { create: { passwordHash, mustChangePassword: true } },
        },
        select: { id: true },
      });
      await tx.platformPrincipal.create({ data: { identityId: identity.id } });
    });
  }
}
