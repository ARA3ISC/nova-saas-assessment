ALTER TABLE "Membership"
ADD COLUMN "organizationWideAccess" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Invitation"
ADD COLUMN "organizationWideAccess" BOOLEAN NOT NULL DEFAULT false;
