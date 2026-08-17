-- CreateEnum
CREATE TYPE "InvitationKind" AS ENUM ('INITIAL_OWNER', 'COLLABORATOR');

-- DropIndex
DROP INDEX "Organization_accessStatus_idx";

-- DropIndex
DROP INDEX "Organization_commercialStatus_idx";

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "organizationId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalizedEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "kind" "InvitationKind" NOT NULL,
    "targetProfile" "OrganizationProfile" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_normalizedEmail_idx" ON "Invitation"("organizationId", "normalizedEmail");

-- CreateIndex
CREATE INDEX "Invitation_organizationId_expiresAt_idx" ON "Invitation"("organizationId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organizationId_normalizedEmail_kind_key" ON "Invitation"("organizationId", "normalizedEmail", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_organizationId_id_key" ON "Invitation"("organizationId", "id");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "Invitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Invitation" FORCE ROW LEVEL SECURITY;

CREATE POLICY invitation_tenant_isolation
ON "Invitation"
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

GRANT SELECT, INSERT, UPDATE, DELETE
ON "Invitation"
TO nova_app;
