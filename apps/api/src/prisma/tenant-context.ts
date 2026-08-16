export type TenantContext = {
  organizationId: string;
  actorId: string;
  accessEpoch: number;
};

export function validateTenantContext(
  context: TenantContext,
): void {
  if (!context.organizationId) {
    throw new Error('organizationId is required');
  }

  if (!context.actorId) {
    throw new Error('actorId is required');
  }

  if (!Number.isInteger(context.accessEpoch)) {
    throw new Error('accessEpoch must be an integer');
  }

  if (context.accessEpoch < 0) {
    throw new Error('accessEpoch must be non-negative');
  }
}
