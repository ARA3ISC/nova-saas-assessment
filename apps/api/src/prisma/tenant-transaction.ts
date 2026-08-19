import { ForbiddenException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';
import { TenantContext, validateTenantContext } from './tenant-context';

type TenantTransaction = Prisma.TransactionClient;

export async function withTenantContext<T>(
  prisma: PrismaService,
  context: TenantContext,
  callback: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  validateTenantContext(context);

  return prisma.$transaction(async (tx) => {
    // The API also performs narrowly scoped global/platform queries through its
    // migration-owner pool. Downgrade every tenant transaction so a superuser
    // connection cannot accidentally bypass forced RLS.
    await tx.$executeRaw`SET LOCAL ROLE nova_app`;

    await tx.$executeRaw`
      SELECT set_config(
        'app.organization_id',
        ${context.organizationId},
        true
      )
    `;

    await tx.$executeRaw`
      SELECT set_config(
        'app.actor_id',
        ${context.actorId},
        true
      )
    `;

    await tx.$executeRaw`
      SELECT set_config(
        'app.access_epoch',
        ${String(context.accessEpoch)},
        true
      )
    `;

    const result = await callback(tx);

    if (context.membershipId) {
      const currentMembership = await tx.membership.findFirst({
        where: {
          id: context.membershipId,
          organizationId: context.organizationId,
          status: 'ACTIVE',
          accessEpoch: context.expectedFinalAccessEpoch ?? context.accessEpoch,
        },
        select: { id: true },
      });
      if (!currentMembership) {
        throw new ForbiddenException('Access changed while the request was in progress');
      }
    }

    return result;
  });
}
