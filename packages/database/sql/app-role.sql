-- The app's own database role, nhip_app (#98). Run once per Neon branch (staging, production),
-- as the role that runs migrations (neondb_owner, over the direct URL), with psql:
--
--   psql "<direct URL as neondb_owner>" -v app_password="$NHIP_APP_PASSWORD" -f app-role.sql
--
-- Safe to run again: it creates the role only if it is missing, and never changes its password.
-- Steps and checks: docs/setup-checklist.md, "The app's database role".
\set ON_ERROR_STOP on

-- Created with SQL, not in the Neon console: console roles join neon_superuser (BYPASSRLS, CREATEROLE).
SELECT format('CREATE ROLE nhip_app LOGIN PASSWORD %L', :'app_password')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'nhip_app') \gexec

-- Reads and writes rows; no DDL, no TRUNCATE. Migrations keep the owner role.
GRANT USAGE ON SCHEMA public TO nhip_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO nhip_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO nhip_app;

-- Tables and sequences later migrations create (as this role) are covered too.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO nhip_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO nhip_app;

-- Never the migration history. On an empty branch the first migration creates it, and the
-- default privileges above grant it; run this file again after that migration.
SELECT 'REVOKE ALL ON public._prisma_migrations FROM nhip_app'
WHERE to_regclass('public._prisma_migrations') IS NOT NULL \gexec

-- Server-side limits, on the role because Neon's pooler refuses them as startup parameters.
-- 25s: statement_timeout also bounds a lock wait; withPipeCredentialLock lets a second instance
-- wait on FOR UPDATE while the first runs its transaction, up to 20s (inbox/store.ts).
ALTER ROLE nhip_app SET statement_timeout = '25s';
-- 30s: above that 20s transaction, which sits idle during the Zalo token call (aborted at 10s).
ALTER ROLE nhip_app SET idle_in_transaction_session_timeout = '30s';
