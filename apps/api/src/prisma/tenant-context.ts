export type TenantContext = {
  organizationId: string;
  actorId: string;
  accessEpoch: number;
  membershipId?: string;
  expectedFinalAccessEpoch?: number;
};

export function validateTenantContext(context: TenantContext): void {
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
  if (
    context.expectedFinalAccessEpoch !== undefined &&
    (!Number.isInteger(context.expectedFinalAccessEpoch) ||
      context.expectedFinalAccessEpoch < context.accessEpoch ||
      context.expectedFinalAccessEpoch > context.accessEpoch + 1)
  ) {
    throw new Error('expectedFinalAccessEpoch must be the current or next access epoch');
  }
}
