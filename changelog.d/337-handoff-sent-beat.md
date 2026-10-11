## 2026-10-11 (a calmer handoff after a send)

### Changed

- **After a send, the row says ✓ Sent, then the list closes up** (#337). In Your turn and
  Unassigned the answered row holds its place with "✓ Sent" for half a second, then fades as the
  rows below close up and the thread below it opens; the card shows the next guest at once. Built
  on React's View Transitions (React 19.3), replacing the hand-written row animation.
