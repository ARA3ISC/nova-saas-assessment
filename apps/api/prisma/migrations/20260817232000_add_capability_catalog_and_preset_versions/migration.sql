CREATE TABLE "CapabilityDefinition" (
  "id" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "platformOnly" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CapabilityDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CapabilityDefinition_key_key" ON "CapabilityDefinition"("key");

CREATE TABLE "PermissionPresetVersion" (
  "id" UUID NOT NULL,
  "organizationId" UUID NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "capabilities" JSONB NOT NULL DEFAULT '[]',
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PermissionPresetVersion_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PermissionPresetVersion_organizationId_key_version_key" ON "PermissionPresetVersion"("organizationId", "key", "version");
CREATE INDEX "PermissionPresetVersion_organizationId_active_idx" ON "PermissionPresetVersion"("organizationId", "active");
ALTER TABLE "PermissionPresetVersion" ADD CONSTRAINT "PermissionPresetVersion_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT ON "CapabilityDefinition" TO nova_app;
ALTER TABLE "PermissionPresetVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PermissionPresetVersion" FORCE ROW LEVEL SECURITY;
CREATE POLICY permission_preset_version_tenant_isolation ON "PermissionPresetVersion" AS PERMISSIVE FOR ALL TO nova_app USING ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organizationId" = NULLIF(current_setting('app.organization_id', true), '')::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON "PermissionPresetVersion" TO nova_app;
