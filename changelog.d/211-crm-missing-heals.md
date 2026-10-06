## 2026-10-06 (a missing CRM lead says so, and heals when its thread is opened)

### Added

- **"Not in CRM yet" on a thread whose CRM lead was never written** (#211, ADR 0003). When the
  office has a CRM and a thread's lead write failed, the thread header shows a neutral "Not in CRM
  yet" chip, never red, to agents and managers. An office with no CRM shows nothing, as before.
- **Opening such a thread retries the lead write once, in the background** (#211). The wait
  since the last failure is stored on the thread, so every server instance honours it and the
  Inbox's 10-second polling never asks the CRM on every refresh. Retries wait 1, 5, 15, then 60
  minutes, and then stay an hour apart. On success the chip turns into "In CRM: {name}". A
  thread deleted under ADR 0020 takes its failure with it and is never retried. Retries with
  nobody opening the thread wait for background jobs (#64, ADR 0023).

### Changed

- **A failed CRM lead write is logged by kind only** (#211): timeout, auth, rejected or other,
  with no thread, guest or CRM id. The old log line named the thread.
- **A HubSpot call gives up after 15 seconds** (#211), so a hung call never holds a thread's lead
  write. It counts as a timeout, retried when the thread is next opened.

### Fixed

- **A lead write that died half-way no longer blocks its thread for good** (#211). Its claim is
  taken over once it is 15 minutes old, longer than any server function runs, so the guest's
  next message or opening the thread writes the lead.
