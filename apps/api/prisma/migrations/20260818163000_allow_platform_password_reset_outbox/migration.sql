-- Platform principals have no Organization membership, but must use the same
-- allowlisted password-recovery email pipeline as Organization identities.
ALTER TABLE "OutboxMessage" ALTER COLUMN "organizationId" DROP NOT NULL;
