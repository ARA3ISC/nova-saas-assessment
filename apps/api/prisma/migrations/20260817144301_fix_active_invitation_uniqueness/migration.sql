-- DropIndex
DROP INDEX "Invitation_organizationId_normalizedEmail_kind_key";

-- CreateIndex
CREATE INDEX "Invitation_organizationId_normalizedEmail_kind_idx"
ON "Invitation"("organizationId", "normalizedEmail", "kind");

-- Create partial unique index for active invitations
CREATE UNIQUE INDEX "Invitation_active_organization_email_key"
ON "Invitation"("organizationId", "normalizedEmail")
WHERE "consumedAt" IS NULL
  AND "revokedAt" IS NULL;
