## 2026-10-07 (Home's Closings and Lost from the CRM)

### Added

- **Home counts Closings and Lost from the office's CRM** (#68, ADR 0003). For the last 30 days'
  leads, Home shows the distinct won and lost leads from the outcomes Nhịp cached from the CRM,
  with "As of <time>", the last time Nhịp heard from it. A deal reached on two threads counts once.
  Home never asks the CRM, so it loads at once with the CRM down.

### Changed

- **An office with no CRM sees "No CRM"** (#68). Closings and Lost stay hatched with a neutral
  "No CRM" chip and "Closings and lost come from your CRM. Nhịp connects the one your office
  uses.", in place of "Connect your CRM", which managers can't do.
