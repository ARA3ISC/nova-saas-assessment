CREATE OR REPLACE FUNCTION nova_assert_active_scope_parent()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'ACTIVE' AND NOT EXISTS (
    SELECT 1
    FROM "Company"
    WHERE id = NEW."companyId"
      AND "organizationId" = NEW."organizationId"
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'active business scope requires an active parent company'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nova_business_scope_active_parent ON "BusinessScope";
CREATE TRIGGER nova_business_scope_active_parent
BEFORE INSERT OR UPDATE OF status, "companyId", "organizationId"
ON "BusinessScope"
FOR EACH ROW
EXECUTE FUNCTION nova_assert_active_scope_parent();

CREATE OR REPLACE FUNCTION nova_prevent_company_deactivation_with_active_scopes()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'INACTIVE' AND OLD.status IS DISTINCT FROM NEW.status AND EXISTS (
    SELECT 1
    FROM "BusinessScope"
    WHERE "organizationId" = NEW."organizationId"
      AND "companyId" = NEW.id
      AND status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'company with active business scopes cannot be deactivated'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS nova_company_active_scope_guard ON "Company";
CREATE TRIGGER nova_company_active_scope_guard
BEFORE UPDATE OF status
ON "Company"
FOR EACH ROW
EXECUTE FUNCTION nova_prevent_company_deactivation_with_active_scopes();
