import { ConflictException } from '@nestjs/common';
import { BusinessScopeType } from '@prisma/client';

const BUSINESS_SCOPE_TYPES = new Set(Object.values(BusinessScopeType));

export function normalizeScopeName(value: string): string {
  return value.trim().normalize('NFKC').replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');
}

export function normalizeExternalIdentifier(value?: string): string | null {
  const normalized = value
    ?.trim()
    .normalize('NFKC')
    .replace(/\s+/gu, ' ')
    .toLocaleLowerCase('en-US');
  return normalized || null;
}

export function requireBusinessScopeType(value: BusinessScopeType): BusinessScopeType {
  if (!BUSINESS_SCOPE_TYPES.has(value)) throw new ConflictException('Invalid Business Scope type');
  return value;
}
