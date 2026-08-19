ALTER TABLE "Invitation" ADD COLUMN "capabilities" JSONB NOT NULL DEFAULT '[]';
CREATE TABLE "CapabilityGrant" (
  "id" UUID NOT NULL, "organizationId" UUID NOT NULL, "membershipId" UUID NOT NULL,
  "capability" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CapabilityGrant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CapabilityGrant_organizationId_membershipId_capability_key" ON "CapabilityGrant"("organizationId", "membershipId", "capability");
CREATE INDEX "CapabilityGrant_organizationId_membershipId_idx" ON "CapabilityGrant"("organizationId", "membershipId");
ALTER TABLE "CapabilityGrant" ADD CONSTRAINT "CapabilityGrant_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapabilityGrant" ADD CONSTRAINT "CapabilityGrant_organizationId_membershipId_fkey" FOREIGN KEY ("organizationId", "membershipId") REFERENCES "Membership"("organizationId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CapabilityGrant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "CapabilityGrant" FORCE ROW LEVEL SECURITY;
CREATE POLICY capability_grant_tenant_isolation ON "CapabilityGrant" AS PERMISSIVE FOR ALL TO nova_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "CapabilityGrant" TO nova_app;
