ALTER TABLE "BusinessScope"
ADD COLUMN "normalizedExternalIdentifier" TEXT;

UPDATE "BusinessScope"
SET
  "normalizedName" = lower(regexp_replace(trim("name"), '\s+', ' ', 'g')),
  "normalizedExternalIdentifier" = NULLIF(
    lower(regexp_replace(trim("externalIdentifier"), '\s+', ' ', 'g')),
    ''
  );

DROP INDEX IF EXISTS "BusinessScope_duplicate_key";

CREATE UNIQUE INDEX "BusinessScope_duplicate_key"
ON "BusinessScope" (
  "organizationId",
  "companyId",
  "type",
  "normalizedName",
  "normalizedExternalIdentifier"
) NULLS NOT DISTINCT;
