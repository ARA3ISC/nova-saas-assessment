-- Ownership is tenant data and must remain readable/updatable during the
-- transaction-local nova_app role downgrade.
ALTER TABLE "OrganizationOwnership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "OrganizationOwnership" FORCE ROW LEVEL SECURITY;

CREATE POLICY organization_ownership_tenant_isolation
ON "OrganizationOwnership"
AS PERMISSIVE
FOR ALL
TO nova_app
USING (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  "organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON "OrganizationOwnership" TO nova_app;
