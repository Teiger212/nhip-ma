# 0025. One office language: the manager sets EN or VI for the whole office

Date: 2026-10-08. Status: accepted. Decided by Eyal on 2026-10-08, answering the grill of the
model layer (ADR 0024). Amends ADR 0007 (a guest message is translated into one language, not
each operator's). Replaces CONTEXT's "operator language".

## Context

- **Two places choose a person's language today, and they can disagree.**
  - The user menu's toggle sets only the `NEXT_LOCALE` cookie and the path prefix (`/en`,
    `/vi`).
  - The account settings' language select writes `User.locale` and sets the cookie.
  - The interface and translations follow the cookie and the path. Alerts, the bell and
    notification emails follow `User.locale`. A null `User.locale` reads as Vietnamese for
    alerts and as the default (English) for the kit's emails.
- **Every guest message is translated into both EN and VI** when it isn't already in that
  language (ADR 0007; `translate.ts`). A JA, KO or RU message costs two model calls.
- **The model's suggested reply needs one second language** (ADR 0024). With a per-person
  language, an unassigned thread's draft has no single reader.
- **An office works in one language in practice.** Its people share threads, notes and
  translations.
- **Office settings are the manager's.** The auto-reply switch sits on the office's settings
  page, General tab, managers only (ADR 0021, #167). The platform admin's page for an office
  shows its details and members, not its settings, and the inbox refuses the platform admin.

## Decision

- **One office language, EN or VI.** The office's manager sets it on the office's settings
  page, General tab, as the auto-reply switch is set.
- **It is every member's interface language.**
  - The `/en` or `/vi` path follows it for members.
  - The per-person EN/VI toggle goes for office members.
  - The platform admin keeps their own language.
- **It is the base language for translation.**
  - A guest message is translated once, into the office language. A message already in it
    isn't translated.
  - The AI suggested reply's second text is in it (ADR 0024).
  - Existing threads keep the translations they already have.
- **The interface includes what Nhịp writes for the office's people:** the operator note,
  alerts and the bell follow the office language too.
- **The platform admin's page for an office doesn't show it,** following the existing pattern:
  office settings are the manager's, and the admin's office page shows no office setting
  today.

## Considered options

- **Keep a language per person.** Two languages in one office double the translation calls,
  leave the draft's second text without a reader, and let alerts and the interface disagree.
- **Put the rule inside ADR 0024.** It changes the interface and routing for every member, not
  only the model layer, so it gets its own record.

## Consequences

- **ADR 0007 changes.** "Every guest message is translated into the operator's language" and
  "a locale the office has not used yet is translated on first request" become one translation
  into the office language.
- **The translation cap is about messages now.** ADR 0024's 1,000 calls a day is about 1,000
  guest messages.
- **Data.** The office language is a new setting of the office, additive, next to the
  auto-reply switch.
- **What goes or changes in the app:** the user menu's toggle and the account settings'
  language select for office members, the locale of alerts and the bell, and the inbox's
  `?locale=` on a thread.
- **Sign-in pages** keep today's cookie and their own switch: no office is known there yet.
- **CONTEXT.md:** "Operator language" becomes "Office language".

## Open

- **The default** for an office whose manager hasn't set one, including every office today.
  Pending Eyal.
