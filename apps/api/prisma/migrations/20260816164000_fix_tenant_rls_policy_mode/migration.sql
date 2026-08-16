DROP POLICY IF EXISTS organization_tenant_isolation
ON "Organization";

CREATE POLICY organization_tenant_isolation
ON "Organization"
AS PERMISSIVE
FOR ALL
TO nova_app
USING (
  id = NULLIF(current_setting('app.organization_id', true), '')::uuid
)
WITH CHECK (
  id = NULLIF(current_setting('app.organization_id', true), '')::uuid
);


DROP POLICY IF EXISTS membership_tenant_isolation
ON "Membership";

CREATE POLICY membership_tenant_isolation
ON "Membership"
AS PERMISSIVE
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


DROP POLICY IF EXISTS company_tenant_isolation
ON "Company";

CREATE POLICY company_tenant_isolation
ON "Company"
AS PERMISSIVE
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


DROP POLICY IF EXISTS business_scope_tenant_isolation
ON "BusinessScope";

CREATE POLICY business_scope_tenant_isolation
ON "BusinessScope"
AS PERMISSIVE
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
