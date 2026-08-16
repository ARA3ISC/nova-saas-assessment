-- This is an empty migration.-- Tenant context helpers.
--
-- These settings are intentionally transaction-local.
-- Missing context must fail closed in RLS policies.

CREATE SCHEMA IF NOT EXISTS app;

-- Runtime application role.
--
-- The role is intentionally NOT granted BYPASSRLS.
-- The migration/admin role (postgres) remains responsible
-- for schema changes and migrations.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_roles
    WHERE rolname = 'nova_app'
  ) THEN
    CREATE ROLE nova_app
      LOGIN
      PASSWORD 'nova_app';
  END IF;
END
$$;

ALTER ROLE nova_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;

-- Allow the runtime role to use the public schema and the
-- application context schema.
GRANT USAGE ON SCHEMA public TO nova_app;
GRANT USAGE ON SCHEMA app TO nova_app;

-- Tenant-owned tables.
ALTER TABLE "Organization" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Organization" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Membership" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Membership" FORCE ROW LEVEL SECURITY;

ALTER TABLE "Company" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Company" FORCE ROW LEVEL SECURITY;

ALTER TABLE "BusinessScope" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessScope" FORCE ROW LEVEL SECURITY;
