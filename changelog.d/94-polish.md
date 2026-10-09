## 2026-10-09 (pre-demo polish: the screens a prospective agency sees)

### Changed

- **An answered thread shows no draft** (#94). While no guest message waits, the reply box folds
  to one line, "Answered · Sent <when> · waiting for the guest", with no textarea and no disabled
  Approve and send; it comes back when the guest writes again.
- **The bell says when and on which pipe** (#94, ADR 0019). A thread given to you shows its time
  and "WhatsApp · Korean", still naming no guest; back-to-back assignments fold into one row
  ("5 threads were assigned to you"). The unread count is a squared badge.
- **One time format** (#94). No year in the current year, the locale's own clock everywhere
  (Home's "As of" included), and waits in whole units: "1 d 16 h", not "40.2 hr".
- **The admin's CRM setting** (#94). The row stacks on a phone; the list reads "Mock CRM" with
  "Development and demo only" under it; a HubSpot pick says it is not saved until its token is,
  with Cancel; Save matches the field's height.
- **The phone's thread** (#94). The header is one line (back, guest, turn); the pipe, owner and
  CRM status move into the details strip; the reply box grows with the draft.
- **The login page offers email and password only** (#94). Magic link and passkey sign-in are
  hidden (`KIT_SCREENS`), not removed; the title is "Sign in to Nhịp".
- **Smaller fixes** (#94). A WhatsApp guest with no name reads as their number with its country
  code and a phone glyph; the Quiet fold has a chevron; a manager's Unassigned view shows a note
  instead of a disabled filter, and tight view tabs share the row; an agent's rows drop the
  "Yours" badge; the phone footer no longer says "Never auto-send" (ADR 0021); Vietnamese
  wording: one word for a thread ("cuộc trò chuyện"), "văn phòng" for the agency, "Lâu chưa
  nhắn" for Quiet and "đừng hỏi dồn" in the operator note.
