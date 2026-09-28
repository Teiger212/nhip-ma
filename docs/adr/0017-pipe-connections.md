# 0017. Pipe connections: the platform admin connects them; a send is live only on a connected pipe

Date: 2026-09-28. Status: accepted. Extends ADRs 0008 and 0010; replaces the process-wide
pipe credentials of the pilot.

## Context

Staging needs a real pipe, and each office must send from its own WhatsApp number or Zalo
OA (PRODUCT.md, "Each office sends from its own numbers"). Vendors let only the owner of a
number or OA authorize an app to act for it, and a Zalo OA's access token expires and its
refresh token works once. The pilot kept one set of credentials in env vars and one
`SEND_MODE` for the whole deployment.

## Decision

- **The platform admin connects an office's pipes** in the admin area (Connections, per
  office), with the agency person who owns the number or OA present to approve on the
  vendor's screen. Reconnect is the same flow. An endpoint belongs to one office at a time;
  connecting one held by another office is refused. Disconnecting ends sending and stops
  filing new messages to the office.
- **A send is live only when the deployment is live and the thread's endpoint has a
  connected pipe connection.** Everything else is mocked: demo threads, fake guests in dev,
  a pipe the office has not connected. `SEND_MODE` stays a deployment-wide switch only:
  `mock` in dev, `live` on staging and prod.
- **Secrets split by owner.** Nhịp's own vendor app registrations (Zalo app, Meta app,
  webhook secrets) are env vars per deployment. Each endpoint's tokens live on its
  connection in the database, encrypted with a key held only in the deployment's env.
- **Zalo refresh runs under a row lock** and writes the new pair in the same transaction:
  two instances never spend the single-use refresh token twice, and a failed refresh writes
  nothing.
- **A broken connection is visible.** Guests' messages still arrive; replies on that pipe
  are blocked in the inbox with the reason, other pipes are unaffected, and the platform
  admin is emailed and sees "Needs reconnect" on the office.

## Considered options

- **The manager connects the office's pipes** themselves: the natural owner of the vendor
  login, but it needs a manager-facing settings surface before the core flows are proven.
  Good enough later; the platform admin with the owner present is enough for beta.
- **Credentials in env vars**: breaks at the second office, and a refreshed token cannot be
  written back.
- **`SEND_MODE=live:<pipes>`** (built, then dropped): a per-deployment pipe list says the
  same thing as "which endpoints are connected", in a second place.

## Consequences

- The Zalo connect is an OAuth flow with PKCE and a callback in the app; the consent
  happens on the platform admin's machine.
- Losing the encryption key disconnects every pipe; reconnecting fixes it.
- The pilot's `ZALO_OA_ACCESS_TOKEN` and `ZALO_OA_ID` env vars go away.
