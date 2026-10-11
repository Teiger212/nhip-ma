## 2026-10-11 (after a send, the inbox opens the next thread down)

### Fixed

- **After a send, the next thread is the one below** (#335). In Your turn and Unassigned, the
  answered thread gives way to the thread that was below it (the one above, when it was last),
  not the first in the list; the toast's "Next" names that same guest.
