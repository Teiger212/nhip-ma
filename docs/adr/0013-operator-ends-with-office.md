# 0013. An operator's account ends with their office; the Answer keeps their name

Date: 2026-09-24. Status: accepted. Extends ADRs 0010 and 0012.

## Context

ADR 0010 made accounts invitation-only, one operator to one office. ADR 0012 made
deleting an office delete its threads and left its operators to a later ADR. Today an
operator whose membership ends (the platform admin deletes the office, removes them from
it, or they leave through the kit's member list) keeps a login with no office. The gate
refuses it with `no_office`, but the login can still sign in, reset its password and
accept a new invitation, and nobody is looking after it. Deleting that account instead
would erase who sent the office's replies, because `Answer.operatorId` is set-null.

## Decision

- **No office, no account.** An operator exists only inside an office. When their
  membership ends, by any path, their account is deleted in the same request, along with
  its sessions, credentials and the invitations it sent.
- **The platform admin is exempt.** A user with `role === "admin"` only loses the
  membership. The rule never deletes them.
- **In the kit's organization hooks, not in the schema.** Before an office is deleted, its
  members' user ids are read; after the delete, the non-admin ones are deleted. Removing a
  member does the same for that one user. The kit's leave route fires no organization
  hook, so leaving goes through the auth after-hook on `/organization/leave`. Nothing
  cascades from `Member` to `User` in the database.
- **Deleted the way Better Auth deletes.** Accounts go through `internalAdapter.deleteUser`,
  the path the admin's "Remove user" takes, so `databaseHooks.user.delete` runs. That hook
  cancels the account's subscriptions on every delete path; the kit had it on self-delete
  only.
- **The Answer keeps the sender's name.** `Answer.operatorName` is written when the
  operator approves: `User.name`, or the email when the name is empty. It is never
  updated afterwards. `operatorId` stays as the live link while the account exists and is
  set to null once the account is gone. Existing rows are backfilled from their linked
  user by `pnpm seed`.
- **Rehiring means a new account.** A person who comes back is invited again and gets a
  new account. Their old Answers keep the name but are not linked to the new account.

## Considered options

- **Ban instead of delete.** Ban keeps the link to Answers. But banned accounts
  accumulate, and rehiring someone into another office needs an unban plus membership
  cleanup, which is a two-step offboarding that someone will forget. The kit's ban stays
  for abuse.
- **Keep the orphan login and show a friendlier `no_office` screen.** This leaves an
  account that can still sign in and accept invitations without anyone looking after it.

## Consequences

- For a non-admin, `no_office` stops being a normal state. The gate still refuses it as a
  guard against a missed hook.
- Removing an operator from a live office leaves its threads and Answers alone. Their
  replies still show who sent them.
- When the office is deleted, Answers go with it (ADR 0012), so the name snapshot only
  matters for operators who leave a live office.
- The seed's walk office is owned by the platform admin. Deleting it in the admin area
  deletes `walk@nhip.local` and leaves `admin@nhip.local`.
- `operatorName` is for the thread's history ("who promised that price?"). Home stays
  office-level; this is not a per-agent performance tool (CONTEXT, "Deliberately not").
- Deleting a user directly with the kit's "remove user" still works. Their membership
  cascades away and their Answers keep the name.
