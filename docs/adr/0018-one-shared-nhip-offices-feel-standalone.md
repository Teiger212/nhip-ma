# 0018. One shared Nhịp; each office feels like its own app

Date: 2026-09-28. Status: accepted. Reaffirms ADR 0008 against a single-tenant alternative.

## Context

Nhịp is sold to one agency at a time and should feel like that agency's own system. Testing
staging showed the kit's multi-tenant seams: the platform admin signs in, creates an
organization, then invites people, and operators can meet "create organization" screens.

## Decision

Every office lives in one shared deployment per environment (ADR 0016), and each office
feels standalone: office setup is one platform-admin step (create the office, invite its
first manager); operators never create, switch or leave offices; the office's name is the
app's name; later, each office gets its own subdomain on Nhịp's own domain. Nothing may
assume a single hostname. The platform admin works in the same app, in its admin area: no
separate back office while Nhịp's staff is one person. That account is guarded instead (2FA,
very few admins; restricting the admin area by IP through the Vercel Firewall if needed).

## Considered options

- **Single-tenant: a deployment per agency** (own URL, database, secrets). Strongest
  isolation and simplest mental model, but every agency adds a Vercel project, a Neon
  database, secrets and a domain, and every release and migration rolls out N times: too
  much operations for one developer. Kept available for an agency that demands separate
  hosting.
