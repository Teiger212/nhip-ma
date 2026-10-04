---
name: database-schema-change
description: Use when changing persisted PostgreSQL models, enums, indexes, relations, or generated database types.
---

# Change the database schema

## Scope

Use for persistent schema changes. Prisma/PostgreSQL is the active runtime, while the three Drizzle schemas and parallel query layer are maintained alternatives. Do not hand-edit `packages/database/prisma/generated` or `packages/database/prisma/zod/index.ts`.

## Procedure

1. Treat `packages/database/prisma/schema.prisma` as the model source. `packages/database/prisma.config.ts` supplies `DATABASE_URL`; `packages/database/index.ts` exports Prisma, and `packages/auth/auth.ts` passes its client to Better Auth's `prismaAdapter`.
2. Change models, enums, relations, indexes, defaults, native types, and `@@map` names in `schema.prisma`. Preserve Better Auth's table/field contract unless the auth integration intentionally changes.
3. Keep all Drizzle variants semantically aligned:
   - `packages/database/drizzle/schema/postgres.ts`
   - `packages/database/drizzle/schema/mysql.ts`
   - `packages/database/drizzle/schema/sqlite.ts`
     Match logical names, nullability, defaults, uniqueness/indexes, foreign-key deletes, relations, and enum value sets using each provider's native types. PostgreSQL is the active Drizzle client/config/barrel, but MySQL and SQLite are maintained starter variants, not disposable examples.
4. Update hand-written cross-provider constants in `packages/database/drizzle/schema/index.ts` and dependent catalogs/types when an enum contract changes.
5. Generate the ignored Prisma client and tracked Zod output from the schema:
   ```bash
   pnpm --filter @repo/database generate
   ```
   Review generated diffs, but correct their source/config and regenerate instead of editing generated files.
6. Apply the change to your dev database with `pnpm --filter @repo/database push` (dev only;
   ADR 0016). Never run `prisma migrate dev` here: every dev database is built with `push`,
   so it stops at "We need to reset". The package's `migrate` script runs `migrate:new` instead.
7. Write the migration that hosted environments (staging, prod) will run:
   ```bash
   pnpm --filter @repo/database migrate:new <short_name>
   ```
   It replays `packages/database/prisma/migrations` into a throwaway database, diffs it against
   `schema.prisma`, and writes `prisma/migrations/<timestamp>_<short_name>/migration.sql`.
   Review the SQL (renames show up as drop + add; data-preserving changes need hand edits) and
   commit it with the schema change. `pnpm --filter @repo/database migrate:check` must then pass;
   CI runs it. A migration must stay backward-compatible with the previous release (ADR 0016).
8. Queries live in `packages/database/prisma/queries` (and the inbox store in
   `packages/database/inbox`); export new modules through `queries/index.ts`.
9. Run database/API tests, then `pnpm format`, `pnpm lint`, and `pnpm type-check`.

## Canonical reference

The notification models/enums in `packages/database/prisma/schema.prisma` are mirrored in all three files under `packages/database/drizzle/schema`. `packages/database/prisma/queries/notifications.ts` and `packages/database/drizzle/queries/notifications.ts` demonstrate matching exported behavior across both query layers.

## Done

Prisma, PostgreSQL/MySQL/SQLite Drizzle definitions, enum constants, and both query implementations express the same domain contract; Prisma generation and the intended migration succeed; exports compile; relevant tests and repository gates pass.

## Common mistakes

- Updating only PostgreSQL Drizzle and leaving MySQL/SQLite semantically stale.
- Matching table columns but not relation, cascade, index, return-shape, or conflict semantics.
- Claiming Drizzle is the active root export; `packages/database/index.ts` exports Prisma.
- Editing generated Prisma client/Zod files or hand-authoring a migration instead of using the package scripts.
- Changing an enum without all schema variants, constants, catalogs, and translations.
