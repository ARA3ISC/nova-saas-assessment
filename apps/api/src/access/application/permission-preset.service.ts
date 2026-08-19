import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { ALLOWED_CAPABILITIES } from '../domain/permission-presets';
import { EffectiveAccess } from './access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../prisma/tenant-transaction';

@Injectable()
export class PermissionPresetService {
  constructor(private readonly prisma: PrismaService) {}

  async list(access: EffectiveAccess) {
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      (tx) =>
        tx.permissionPresetVersion.findMany({
          where: { active: true },
          orderBy: [{ key: 'asc' }, { version: 'desc' }],
          select: { id: true, key: true, label: true, version: true, capabilities: true },
        }),
    );
  }

  async resolve(tx: Prisma.TransactionClient, presetId?: string): Promise<string[]> {
    if (!presetId) return [];
    const preset = await tx.permissionPresetVersion.findFirst({
      where: { id: presetId, active: true },
      select: { capabilities: true },
    });
    const capabilities = Array.isArray(preset?.capabilities)
      ? preset.capabilities.filter((value): value is string => typeof value === 'string')
      : [];
    if (!preset || capabilities.some((value) => !ALLOWED_CAPABILITIES.has(value))) {
      throw new ConflictException('Unknown or invalid permission preset');
    }
    return [...new Set(capabilities)];
  }

  async createVersion(
    access: EffectiveAccess,
    params: {
      key: string;
      label: string;
      capabilities: string[];
      reason: string;
      confirmed: boolean;
    },
  ) {
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');

    const key = params.key.trim().toUpperCase();
    const label = params.label.trim();
    const reason = params.reason.trim();
    const capabilities = [...new Set(params.capabilities.map((value) => value.trim()))].filter(
      Boolean,
    );

    if (!params.confirmed || !reason) {
      throw new ConflictException('A reason and explicit confirmation are required');
    }
    if (!/^[A-Z][A-Z0-9_]{1,49}$/.test(key)) {
      throw new ConflictException('Invalid permission preset key');
    }
    if (!label || label.length > 100) {
      throw new ConflictException('Invalid permission preset label');
    }
    if (!capabilities.length || capabilities.some((value) => !ALLOWED_CAPABILITIES.has(value))) {
      throw new ConflictException('Unknown or invalid capability');
    }

    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(
            hashtextextended(${`${access.organizationId}:${key}`}, 0)
          )
        `;
        const definitions = await tx.capabilityDefinition.count({
          where: {
            key: { in: capabilities },
            active: true,
            platformOnly: false,
          },
        });
        if (definitions !== capabilities.length) {
          throw new ConflictException('Unknown or invalid capability');
        }

        const latest = await tx.permissionPresetVersion.findFirst({
          where: { key },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const preset = await tx.permissionPresetVersion.create({
          data: {
            organizationId: access.organizationId,
            key,
            label,
            version: (latest?.version ?? 0) + 1,
            capabilities,
          },
          select: { id: true, key: true, label: true, version: true, capabilities: true },
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'PERMISSION_PRESET_VERSION_CREATED',
            reason,
            subjectType: 'PermissionPresetVersion',
            subjectId: preset.id,
            before: latest ? { version: latest.version } : {},
            after: { key, label, version: preset.version, capabilities },
          },
        });
        return preset;
      },
    );
  }
}
