import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BusinessScopeStatus, BusinessScopeType, CompanyStatus, Prisma } from '@prisma/client';

import { EffectiveAccess } from '../../access/application/access.service';
import { PrismaService } from '../../prisma/prisma.service';
import { withTenantContext } from '../../prisma/tenant-transaction';
import {
  normalizeExternalIdentifier,
  normalizeScopeName,
  requireBusinessScopeType,
} from '../domain/business-scope-identity';

@Injectable()
export class OrganizationAdminService {
  constructor(private readonly prisma: PrismaService) {}

  async createCompany(access: EffectiveAccess, name: string) {
    this.requireAdministrator(access);
    const trimmed = name.trim();
    if (!trimmed) throw new ConflictException('Company name is required');
    return this.inTenant(access, async (tx) => {
      let company;
      try {
        company = await tx.company.create({
          data: { organizationId: access.organizationId, name: trimmed },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('A Company with this name already exists');
        throw error;
      }
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'COMPANY_CREATED',
          reason: 'Company created through Organization administration',
          subjectType: 'Company',
          subjectId: company.id,
          before: {},
          after: { id: company.id, name: company.name, source: 'MANUAL' },
        },
      });
      return company;
    });
  }

  async createBusinessScope(
    access: EffectiveAccess,
    params: {
      companyId: string;
      type: BusinessScopeType;
      name: string;
      externalIdentifier?: string;
      location?: string;
      responsiblePerson?: string;
      sectorCounterpart?: string;
      confirmed: boolean;
    },
  ) {
    this.requireAdministrator(access);
    if (!params.confirmed) throw new ConflictException('Explicit confirmation is required');
    const name = params.name.trim().normalize('NFKC').replace(/\s+/gu, ' ');
    const normalizedName = normalizeScopeName(params.name);
    if (!normalizedName) throw new ConflictException('Business scope name is required');
    const type = requireBusinessScopeType(params.type);
    const externalIdentifier = params.externalIdentifier?.trim() || null;
    const normalizedExternalIdentifier = normalizeExternalIdentifier(params.externalIdentifier);
    return this.inTenant(access, async (tx) => {
      const company = await this.lockCompany(tx, params.companyId);
      if (!company || company.status !== 'ACTIVE') throw new NotFoundException('Company not found');
      try {
        const scope = await tx.businessScope.create({
          data: {
            organizationId: access.organizationId,
            companyId: company.id,
            type,
            name,
            normalizedName,
            externalIdentifier,
            normalizedExternalIdentifier,
            location: params.location?.trim() || null,
            responsiblePerson: params.responsiblePerson?.trim() || null,
            sectorCounterpart: params.sectorCounterpart?.trim() || null,
          },
        });
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'BUSINESS_SCOPE_CREATED',
            reason: 'Business Scope created through guided manual entry',
            subjectType: 'BusinessScope',
            subjectId: scope.id,
            before: {},
            after: {
              id: scope.id,
              companyId: company.id,
              type,
              name,
              source: 'MANUAL',
            },
          },
        });
        return scope;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('A matching Business Scope already exists');
        }
        throw error;
      }
    });
  }

  async renameCompany(
    access: EffectiveAccess,
    companyId: string,
    name: string,
    expectedVersion: number,
  ) {
    this.requireAdministrator(access);
    const trimmed = name.trim();
    if (!trimmed) throw new ConflictException('Company name is required');
    return this.inTenant(access, async (tx) => {
      const company = await tx.company.findFirst({
        where: { id: companyId },
        select: { id: true, name: true, version: true },
      });
      if (!company) throw new NotFoundException('Company not found');
      if (!Number.isInteger(expectedVersion) || company.version !== expectedVersion)
        throw new ConflictException('Company changed; refresh and retry');
      try {
        const claim = await tx.company.updateMany({
          where: { id: company.id, version: expectedVersion },
          data: { name: trimmed, version: { increment: 1 } },
        });
        if (claim.count !== 1) throw new ConflictException('Company changed; refresh and retry');
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')
          throw new ConflictException('A Company with this name already exists');
        throw error;
      }
      const updated = { id: company.id, name: trimmed, version: company.version + 1 };
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'COMPANY_UPDATED',
          reason: 'Company identity updated',
          subjectType: 'Company',
          subjectId: company.id,
          before: company,
          after: { id: updated.id, name: updated.name },
        },
      });
      return updated;
    });
  }

  async reactivateCompany(
    access: EffectiveAccess,
    companyId: string,
    reason: string,
    confirmed: boolean,
  ) {
    return this.changeCompanyStatus(access, companyId, 'ACTIVE', reason, confirmed);
  }

  async deactivateCompany(
    access: EffectiveAccess,
    companyId: string,
    reason: string,
    confirmed: boolean,
  ) {
    this.requireAdministrator(access);
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      const company = await this.lockCompany(tx, companyId);
      if (!company) throw new NotFoundException('Company not found');
      const activeScopes = await tx.businessScope.findMany({
        where: { companyId, status: BusinessScopeStatus.ACTIVE },
        orderBy: { name: 'asc' },
        take: 6,
        select: { name: true },
      });
      if (activeScopes.length > 0) {
        const visibleNames = activeScopes
          .slice(0, 5)
          .map((scope) => scope.name)
          .join(', ');
        const remainder = activeScopes.length > 5 ? ' and additional active scopes' : '';
        throw new ConflictException(
          `Deactivate these active Business Scopes first: ${visibleNames}${remainder}. Then retry Company deactivation.`,
        );
      }
      const updated = await tx.company.update({
        where: { id: companyId },
        data: { status: 'INACTIVE' },
      });
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: 'COMPANY_DEACTIVATED',
          reason: reason.trim(),
          subjectType: 'Company',
          subjectId: company.id,
          before: { status: company.status },
          after: { status: updated.status },
        },
      });
      return updated;
    });
  }

  async listCompanies(access: EffectiveAccess, query?: string) {
    if (access.profile === 'User' && !(access.capabilities ?? []).includes('companies.read'))
      return [];
    const search = query?.trim();
    return this.inTenant(access, async (tx) => {
      const organizationMatch = search
        ? await tx.organization.findFirst({
            where: { name: { contains: search, mode: 'insensitive' } },
            select: { id: true },
          })
        : null;
      return tx.company.findMany({
        where: {
          ...(access.profile === 'User' && !access.organizationWideAccess
            ? { id: { in: access.companyIds ?? [] } }
            : {}),
          ...(search && !organizationMatch
            ? { name: { contains: search, mode: 'insensitive' } }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 50,
        select: {
          id: true,
          name: true,
          status: true,
          version: true,
          _count: { select: { businessScopes: true } },
        },
      });
    });
  }

  async listBusinessScopes(access: EffectiveAccess, query?: string) {
    if (access.profile === 'User' && !(access.capabilities ?? []).includes('business_scopes.read'))
      return [];
    const search = query?.trim();
    return this.inTenant(access, async (tx) => {
      const organizationMatch = search
        ? await tx.organization.findFirst({
            where: { name: { contains: search, mode: 'insensitive' } },
            select: { id: true },
          })
        : null;
      return tx.businessScope.findMany({
        where: {
          ...(access.profile === 'User' && !access.organizationWideAccess
            ? {
                OR: [
                  { id: { in: access.businessScopeIds ?? [] } },
                  { companyId: { in: access.companyIds ?? [] } },
                ],
              }
            : {}),
          ...(search && !organizationMatch
            ? {
                AND: [
                  {
                    OR: [
                      { name: { contains: search, mode: 'insensitive' } },
                      { externalIdentifier: { contains: search, mode: 'insensitive' } },
                      { company: { name: { contains: search, mode: 'insensitive' } } },
                    ],
                  },
                ],
              }
            : {}),
        },
        orderBy: { name: 'asc' },
        take: 50,
        select: {
          id: true,
          name: true,
          type: true,
          externalIdentifier: true,
          location: true,
          responsiblePerson: true,
          sectorCounterpart: true,
          status: true,
          version: true,
          company: { select: { id: true, name: true } },
        },
      });
    });
  }

  async deactivateBusinessScope(
    access: EffectiveAccess,
    scopeId: string,
    reason: string,
    confirmed: boolean,
  ) {
    return this.changeBusinessScopeStatus(access, scopeId, 'INACTIVE', reason, confirmed);
  }

  async reactivateBusinessScope(
    access: EffectiveAccess,
    scopeId: string,
    reason: string,
    confirmed: boolean,
  ) {
    return this.changeBusinessScopeStatus(access, scopeId, 'ACTIVE', reason, confirmed);
  }

  async updateBusinessScope(
    access: EffectiveAccess,
    scopeId: string,
    params: {
      type: BusinessScopeType;
      name: string;
      externalIdentifier?: string;
      location?: string;
      responsiblePerson?: string;
      sectorCounterpart?: string;
      expectedVersion: number;
    },
  ) {
    this.requireAdministrator(access);
    const name = params.name.trim().normalize('NFKC').replace(/\s+/gu, ' ');
    const normalizedName = normalizeScopeName(params.name);
    if (!normalizedName) throw new ConflictException('Business scope name is required');
    const type = requireBusinessScopeType(params.type);
    const externalIdentifier = params.externalIdentifier?.trim() || null;
    const normalizedExternalIdentifier = normalizeExternalIdentifier(params.externalIdentifier);
    return this.inTenant(access, async (tx) => {
      const scope = await tx.businessScope.findFirst({ where: { id: scopeId } });
      if (!scope) throw new NotFoundException('Business scope not found');
      if (!Number.isInteger(params.expectedVersion) || scope.version !== params.expectedVersion)
        throw new ConflictException('Business Scope changed; refresh and retry');
      try {
        const claim = await tx.businessScope.updateMany({
          where: { id: scope.id, version: params.expectedVersion },
          data: {
            type,
            name,
            normalizedName,
            externalIdentifier,
            normalizedExternalIdentifier,
            location: params.location?.trim() || null,
            responsiblePerson: params.responsiblePerson?.trim() || null,
            sectorCounterpart: params.sectorCounterpart?.trim() || null,
            version: { increment: 1 },
          },
        });
        if (claim.count !== 1)
          throw new ConflictException('Business Scope changed; refresh and retry');
        const updated = {
          ...scope,
          type,
          name,
          normalizedName,
          externalIdentifier,
          normalizedExternalIdentifier,
          location: params.location?.trim() || null,
          responsiblePerson: params.responsiblePerson?.trim() || null,
          sectorCounterpart: params.sectorCounterpart?.trim() || null,
          version: scope.version + 1,
        };
        await tx.auditEvidence.create({
          data: {
            organizationId: access.organizationId,
            actorId: access.identityId,
            action: 'BUSINESS_SCOPE_UPDATED',
            reason: 'Business Scope identity updated',
            subjectType: 'BusinessScope',
            subjectId: scope.id,
            before: scope,
            after: updated,
          },
        });
        return updated;
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          throw new ConflictException('A matching Business Scope already exists');
        }
        throw error;
      }
    });
  }

  private async changeBusinessScopeStatus(
    access: EffectiveAccess,
    scopeId: string,
    status: BusinessScopeStatus,
    reason: string,
    confirmed: boolean,
  ) {
    this.requireAdministrator(access);
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      const scope = await tx.businessScope.findFirst({
        where: { id: scopeId },
        select: { id: true, status: true, companyId: true },
      });
      if (!scope) throw new NotFoundException('Business scope not found');
      const company = await this.lockCompany(tx, scope.companyId);
      if (!company) throw new NotFoundException('Company not found');
      if (status === 'ACTIVE' && company.status !== 'ACTIVE') {
        throw new ConflictException('Reactivate the parent Company first');
      }
      if (scope.status === status) return { id: scope.id, status: scope.status };
      const updated = await tx.businessScope.update({
        where: { id: scope.id },
        data: { status },
      });
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: `BUSINESS_SCOPE_${status === 'ACTIVE' ? 'REACTIVATED' : 'DEACTIVATED'}`,
          reason: reason.trim(),
          subjectType: 'BusinessScope',
          subjectId: scope.id,
          before: { status: scope.status },
          after: { status: updated.status },
        },
      });
      return updated;
    });
  }

  private async changeCompanyStatus(
    access: EffectiveAccess,
    companyId: string,
    status: 'ACTIVE' | 'INACTIVE',
    reason: string,
    confirmed: boolean,
  ) {
    this.requireAdministrator(access);
    this.requireConfirmation(reason, confirmed);
    return this.inTenant(access, async (tx) => {
      const company = await this.lockCompany(tx, companyId);
      if (!company) throw new NotFoundException('Company not found');
      if (company.status === status) return company;
      const updated = await tx.company.update({ where: { id: company.id }, data: { status } });
      await tx.auditEvidence.create({
        data: {
          organizationId: access.organizationId,
          actorId: access.identityId,
          action: `COMPANY_${status === 'ACTIVE' ? 'REACTIVATED' : 'DEACTIVATED'}`,
          reason: reason.trim(),
          subjectType: 'Company',
          subjectId: company.id,
          before: { status: company.status },
          after: { status: updated.status },
        },
      });
      return updated;
    });
  }

  async findBusinessScopeDuplicate(
    access: EffectiveAccess,
    params: {
      companyId: string;
      type: BusinessScopeType;
      name: string;
      externalIdentifier?: string;
    },
  ) {
    this.requireAdministrator(access);
    const normalizedName = normalizeScopeName(params.name);
    if (!normalizedName) throw new ConflictException('Business scope name is required');
    const type = requireBusinessScopeType(params.type);
    const normalizedExternalIdentifier = normalizeExternalIdentifier(params.externalIdentifier);
    return this.inTenant(access, (tx) =>
      tx.businessScope.findFirst({
        where: {
          companyId: params.companyId,
          type,
          normalizedName,
          normalizedExternalIdentifier,
        },
        select: { id: true, name: true, type: true, externalIdentifier: true, status: true },
      }),
    );
  }

  private requireAdministrator(access: EffectiveAccess): void {
    if (access.profile !== 'Administrator') throw new ForbiddenException('Access denied');
  }

  private async lockCompany(
    tx: Prisma.TransactionClient,
    companyId: string,
  ): Promise<{ id: string; status: CompanyStatus } | undefined> {
    const rows = await tx.$queryRaw<{ id: string; status: CompanyStatus }[]>`
      SELECT id, status
      FROM "Company"
      WHERE id = ${companyId}::uuid
      FOR UPDATE
    `;
    return rows[0];
  }

  private requireConfirmation(reason: string, confirmed: boolean): void {
    if (!confirmed || !reason.trim())
      throw new ConflictException('A reason and explicit confirmation are required');
  }

  private inTenant<T>(
    access: EffectiveAccess,
    callback: Parameters<typeof withTenantContext<T>>[2],
  ) {
    return withTenantContext(
      this.prisma,
      {
        organizationId: access.organizationId,
        actorId: access.identityId,
        accessEpoch: access.accessEpoch,
        membershipId: access.membershipId,
      },
      callback,
    );
  }
}
