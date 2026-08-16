GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  "Organization",
  "Membership",
  "Company",
  "BusinessScope"
TO nova_app;

GRANT SELECT, INSERT, UPDATE, DELETE
ON TABLE
  "Identity",
  "PasswordCredential",
  "AuthSession",
  "PasswordResetToken",
  "AuthenticationThrottle",
  "PlatformPrincipal"
TO nova_app;

GRANT USAGE, SELECT
ON ALL SEQUENCES IN SCHEMA public
TO nova_app;
