CREATE TYPE "OwnershipTransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'CANCELLED');
CREATE TABLE "OwnershipTransferProposal" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "proposerMembershipId" UUID NOT NULL,
  "successorMembershipId" UUID NOT NULL, "status" "OwnershipTransferStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL, "acceptedAt" TIMESTAMP(3), "cancelledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipTransferProposal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "OwnershipTransferProposal_organizationId_status_idx" ON "OwnershipTransferProposal"("organizationId", "status");
ALTER TABLE "OwnershipTransferProposal" ADD CONSTRAINT "OwnershipTransferProposal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OwnershipTransferProposal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OwnershipTransferProposal" FORCE ROW LEVEL SECURITY;
CREATE POLICY ownership_transfer_proposal_tenant_isolation ON "OwnershipTransferProposal" AS PERMISSIVE FOR ALL TO nova_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "OwnershipTransferProposal" TO nova_app;
