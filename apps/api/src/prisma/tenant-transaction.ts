import { Prisma } from '@prisma/client';

import { PrismaService } from './prisma.service';
import {
  TenantContext,
  validateTenantContext,
} from './tenant-context';

type TenantTransaction = Prisma.TransactionClient;

export async function withTenantContext<T>(
  prisma: PrismaService,
  context: TenantContext,
  callback: (tx: TenantTransaction) => Promise<T>,
): Promise<T> {
  validateTenantContext(context);

  return prisma.$transaction(async (tx) => {
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

    return callback(tx);
  });
}
