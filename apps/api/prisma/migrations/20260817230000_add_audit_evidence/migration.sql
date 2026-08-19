CREATE TABLE "AuditEvidence" ("id" UUID NOT NULL, "organizationId" UUID NOT NULL, "actorId" UUID NOT NULL, "action" TEXT NOT NULL, "reason" TEXT NOT NULL, "subjectType" TEXT NOT NULL, "subjectId" UUID NOT NULL, "before" JSONB NOT NULL, "after" JSONB NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "AuditEvidence_pkey" PRIMARY KEY ("id"));
CREATE INDEX "AuditEvidence_organizationId_createdAt_idx" ON "AuditEvidence"("organizationId", "createdAt");
ALTER TABLE "AuditEvidence" ADD CONSTRAINT "AuditEvidence_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AuditEvidence" ENABLE ROW LEVEL SECURITY; ALTER TABLE "AuditEvidence" FORCE ROW LEVEL SECURITY;
CREATE POLICY audit_evidence_tenant_isolation ON "AuditEvidence" AS PERMISSIVE FOR ALL TO nova_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "AuditEvidence" TO nova_app;
