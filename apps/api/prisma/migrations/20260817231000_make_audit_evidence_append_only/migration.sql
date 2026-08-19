-- Audit evidence is append-only for the restricted runtime role. Platform
-- migrations/operations run through separately controlled database authority;
-- customer runtime code can only read or append tenant-scoped evidence.
REVOKE UPDATE, DELETE ON "AuditEvidence" FROM nova_app;
REVOKE TRUNCATE ON "AuditEvidence" FROM nova_app;

DROP POLICY IF EXISTS audit_evidence_tenant_isolation ON "AuditEvidence";
CREATE POLICY audit_evidence_tenant_read_insert_only
ON "AuditEvidence"
AS PERMISSIVE
FOR SELECT
TO nova_app
USING (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
);

CREATE POLICY audit_evidence_tenant_append_only
ON "AuditEvidence"
AS PERMISSIVE
FOR INSERT
TO nova_app
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
);
