---
name: add-a-notification
description: Use when adding an in-app notification type, preference, producer, or presentation.
---

# Add a notification

## Scope

Use for typed notification events, delivered in-app (the bell). Nhịp sends no notification emails (PRODUCT.md "Deliberately not"): `createNotification` emails only the types in its `EMAIL_TYPES` allow-list, which holds the kit's `WELCOME` alone. Do not add to it, and do not bypass it with direct mail sends; an email the person is waiting for is a transactional template (`add-or-edit-an-email`). Do not bypass preference checks with direct database inserts.

## Procedure

1. Add the type to `NotificationType` in `packages/database/prisma/schema.prisma`.
2. Generate, and write the migration (an added enum value is one deploy, `packages/database/AGENTS.md`, "Schema changes are expand/contract"):
   ```bash
   pnpm --filter @repo/database generate
   pnpm --filter @repo/database push
   pnpm --filter @repo/database migrate <short_name>
   ```
   `push` applies the change to your dev database; `migrate <name>` writes the migration
   (`migrations.sh new`; read it, and see the `database-schema-change` skill).
3. Add the value to `NOTIFICATION_TYPES` in `packages/notifications/src/types.ts`, then update `NotificationTypeId` and, if user-configurable, the ordered group in `packages/notifications/src/catalog.ts`.
4. If user-configurable, add `settings.notificationsPage.types.<TYPE>.label` to every `packages/i18n/translations/*/saas.json`. A type outside the catalog cannot be turned off: `createNotification` ignores preferences for it. For a configurable type, update the `onToggle` type in `apps/saas/modules/settings/components/NotificationPreferencesForm.tsx` if its explicit union does not yet include it.
5. Add a producer and call `createNotification({ userId, type, data, link })`. Store the facts in `data` and render the row in the reader's language in `apps/saas/modules/shared/components/NotificationCenter.tsx` (`app.notifications.*`), rather than frozen copy.
6. Trigger the producer only after the underlying transaction succeeds. Keep failures observable with `@repo/logs` when notification delivery must not roll back the primary action.
7. Test who gets the bell row, its data, and that nothing is emailed (mock `@repo/mail` and point the app client at the test database: `useTestDatabaseForAppClient`).
8. Run database/API/SaaS tests and repository gates.

## Canonical reference

`apps/saas/modules/inbox/lib/pipes/alerts.ts` gives every platform admin a `PIPE_DISCONNECTED` bell row, logging failures without blocking the send path; `alerts.db.test.ts` beside it is the test.

## Done

The enum is synchronized across Prisma, its migration, `NOTIFICATION_TYPES`, the catalog, Zod generation, settings UI, and every locale; `migrate:check` passes; tests and gates pass.

## Common mistakes

- Editing generated Prisma enum output.
- Adding the enum only to Prisma or only to the settings catalog.
- Adding a type to `EMAIL_TYPES`.
- Calling `insertNotification` directly and skipping channel preferences.
- Adding a settings row without extending the form's explicit type union.
