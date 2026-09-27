# E2E scenarios

What a person does in Nhịp is tested end to end, not with unit tests (AGENTS.md, "What
gets a test"). The E2E tools and architecture are still to be planned; until then each
user-driven flow is written here, so the plan starts from a list instead of a memory. When
a scenario gets its test, link the spec file next to it.

Seed: `pnpm seed --reset` (walk office, mock CRM). Logins: `walk@nhip.local` (agent),
`admin@nhip.local` (platform admin), password `walkthrough`.

## CRM (ADR 0003)

1. **Link a thread by hand.** As the agent, open Minji's thread, choose "Link to CRM lead",
   search "minji", pick Minji Park. The header shows "In CRM: Minji Park".
2. **Unlink sticks.** Unlink Minji's thread; after the next refresh (10 minutes, or reload
   after changing the TTL for the test) it is still unlinked, even though her phone would
   match.
3. **A lead of another office cannot be linked.** Posting another office's lead id to
   `/api/conversations/:id/crm-link` answers 404 `lead_not_found`; another office's thread
   answers 404 `not_found`.
4. **No CRM, no picker.** With the office's CRM set to None, the thread shows no CRM chip
   and the leads search answers 409 `crm_not_connected`.
5. **Lost leaves the queue, and comes back.** Alexei (lost in the mock CRM) is under Sent
   with "Lost", not in Your turn or Quiet. Send a guest message as Alexei
   (`POST /dev/inbound`); he is back in Your turn.
6. **Home counts deals from the CRM.** Home shows Closings and Lost with "From your CRM ·
   n of m leads linked". Link a second thread to the same won lead: Closings does not go
   up.
7. **CRM down.** With the CRM failing (a test adapter that throws), Home loads, shows the
   cached Closings and Lost, and says the CRM did not answer in time.
8. **The admin connects an office.** As the platform admin, Admin → Organizations → walk
   office → CRM: choose None; the agent's Home shows "Connect your CRM". Choose Mock CRM;
   the numbers return. A non-admin calling the admin CRM procedure is refused.
