-- This is an empty migration.-- ============================================================
-- Organization
-- ============================================================

CREATE POLICY organization_tenant_isolation
ON "Organization"
AS RESTRICTIVE
FOR ALL
TO nova_app
USING (
  id = NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  id = NULLIF(current_setting('app.organization_id', true), '')::uuid
);


-- ============================================================
-- Membership
-- ============================================================

CREATE POLICY membership_tenant_isolation
ON "Membership"
AS RESTRICTIVE
FOR ALL
TO nova_app
USING (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
);


-- ============================================================
-- Company
-- ============================================================

CREATE POLICY company_tenant_isolation
ON "Company"
AS RESTRICTIVE
FOR ALL
TO nova_app
USING (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
);


-- ============================================================
-- BusinessScope
-- ============================================================

CREATE POLICY business_scope_tenant_isolation
ON "BusinessScope"
AS RESTRICTIVE
FOR ALL
TO nova_app
USING (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  "organizationId" =
    NULLIF(current_setting('app.organization_id', true), '')::uuid
);
