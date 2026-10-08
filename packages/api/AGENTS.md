# packages/api

oRPC procedures and server-side notifications. Repo-wide rules are in the root
[AGENTS.md](../../AGENTS.md); permission checks in procedures are in
[apps/saas/AGENTS.md](../../apps/saas/AGENTS.md) ("Permissions (Permix)"), and database access
in [packages/database/AGENTS.md](../database/AGENTS.md).

## API & data layer

oRPC modules live under `packages/api/modules`. Procedures use `publicProcedure`,
`protectedProcedure`, or `adminProcedure`, with route metadata, Zod input validation,
middleware, and a handler. Follow `packages/api/modules/organizations/procedures/`.

## Notifications

Create server-side notifications with `createNotification` from
`packages/notifications/src/create-notification.ts`. Types and kinds live in
`packages/notifications/src/types.ts`, and the settings catalog lives in
`packages/notifications/src/catalog.ts`; keep the database enum, catalog, and i18n labels in sync.
A notification is a bell row only: `createNotification` emails just the types in its `EMAIL_TYPES`
allow-list (the kit's `WELCOME`), whatever the preferences say (PRODUCT.md "Deliberately not").
