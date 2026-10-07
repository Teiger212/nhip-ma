## 2026-10-07 (a rich dev and demo seed: every state, two offices)

### Added

- **`pnpm seed` writes a dev and demo dataset with every state in it** (#69). About sixty
  invented guests over the last 30 days, so Home's funnel, response time and leads by day have
  shape and the Inbox tabs show two-digit counts. The walk office holds every Inbox state
  (Unassigned, each agent's and the manager's, Your turn, Quiet, Sent, written back), greeted
  guests, bell rows and the alert log, a deleted guest's receipt and lead tally, and every CRM
  state on the mock CRM: in CRM, Not in CRM yet, Won, Lost, lost and written back, two leads
  sharing a phone, an unmatched lead. A second office has its own manager and agents, its
  auto-reply off and no CRM, and shares nothing with the first. Guests write on WhatsApp and
  Zalo in seven languages, with translations and qualifiers filled. Every row is written by the
  app's own calls, each at its story's time, with no model call and nothing sent or pushed. A
  re-run adds nothing, and `pnpm seed -- --reset` rewrites the seed's own rows as of now.
- **The seed refuses production** (#69). It refuses `VERCEL_ENV=production`, and any database
  that isn't on this machine unless `SEED_REMOTE_DATABASE_HOST` names its host (the Neon `dev`
  branch). This includes the E2E run's seed, whose database is local. What the E2E run's seed
  writes is unchanged: the walk logins and the four demo threads.
