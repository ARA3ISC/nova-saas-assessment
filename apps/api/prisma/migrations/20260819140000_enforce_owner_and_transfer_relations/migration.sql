ALTER TABLE "OwnershipTransferProposal"
ADD CONSTRAINT "OwnershipTransferProposal_organizationId_proposerMembershipId_fkey"
FOREIGN KEY ("organizationId", "proposerMembershipId")
REFERENCES "Membership"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OwnershipTransferProposal"
ADD CONSTRAINT "OwnershipTransferProposal_organizationId_successorMembershipId_fkey"
FOREIGN KEY ("organizationId", "successorMembershipId")
REFERENCES "Membership"("organizationId", "id")
ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION nova_assert_active_organization_owner(target_organization UUID)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "Organization"
    WHERE "id" = target_organization AND "accessStatus" = 'ACTIVE'
  ) AND (
    SELECT COUNT(*)
    FROM "OrganizationOwnership" ownership
    JOIN "Membership" membership
      ON membership."organizationId" = ownership."organizationId"
     AND membership."id" = ownership."membershipId"
    WHERE ownership."organizationId" = target_organization
      AND membership."status" = 'ACTIVE'
      AND membership."profile" = 'Administrator'
  ) <> 1 THEN
    RAISE EXCEPTION 'active organization requires exactly one active Administrator owner'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION nova_check_owner_from_organization()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nova_assert_active_organization_owner(COALESCE(NEW."id", OLD."id"));
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION nova_check_owner_from_membership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nova_assert_active_organization_owner(
    COALESCE(NEW."organizationId", OLD."organizationId")
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION nova_check_owner_from_ownership()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  PERFORM nova_assert_active_organization_owner(
    COALESCE(NEW."organizationId", OLD."organizationId")
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE CONSTRAINT TRIGGER organization_active_owner_invariant
AFTER INSERT OR UPDATE OF "accessStatus" ON "Organization"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION nova_check_owner_from_organization();

CREATE CONSTRAINT TRIGGER membership_active_owner_invariant
AFTER UPDATE OF "status", "profile", "organizationId" OR DELETE ON "Membership"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION nova_check_owner_from_membership();

CREATE CONSTRAINT TRIGGER ownership_active_owner_invariant
AFTER INSERT OR UPDATE OR DELETE ON "OrganizationOwnership"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION nova_check_owner_from_ownership();
