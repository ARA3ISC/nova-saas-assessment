DROP INDEX IF EXISTS "BusinessScope_organizationId_companyId_type_normalizedName__key";

CREATE UNIQUE INDEX "BusinessScope_duplicate_key"
ON "BusinessScope" (
  "organizationId",
  "companyId",
  "type",
  "normalizedName",
  "externalIdentifier"
) NULLS NOT DISTINCT;
