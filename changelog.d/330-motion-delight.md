## 2026-10-11 (The next guest steps up: motion and delight for the demo)

### Added

- **All caught up, where the agent is looking** (#330; Eyal, 2026-10-11). After the last reply is
  sent, the open card says "All caught up. No guest is waiting on you. The next one to write will
  open here." and "Last reply sent to {name} at {time}", under a Pebble Strong mark whose green
  check strokes in. It used to say "No conversation selected.", and on a phone that screen had no
  way back: it now has "View sent", which returns to the list on Sent. A manager whose Unassigned
  empties sees "Every lead is assigned." in the same card.
- **Sent, then who's next** (#330). The sent toast adds "Next: {name}, waiting {duration}" in Your
  turn and Unassigned, so a phone agent knows the guest on screen changed.
- **The handoff** (#330). Once the server confirms Approve and send, the answered row fades 12px
  to the left while the rows below glide up, and the card turns to the next guest (a cross-fade
  on a desk, a 12px step forward on a phone). Only transform and opacity move, and a row whose
  data didn't change isn't rendered again.
- **Counts tick** (#330). The view tabs, the nav count and the phone top bar's count: the new value
  rises into place as the old one leaves.
- **The phone pushes into a thread** (#330). On a phone the thread slides in over the list, which
  recedes, and Back reverses it (View Transitions; where the browser lacks them, the swap is
  instant as before).

### Changed

- **A failed send says the reply is kept** (#330). "Send failed. Your reply is still here.", or the
  server's reason followed by "Your reply is still here.", in red with its glyph, on up to two
  lines. There is deliberately no "Try again", which could send twice. A failure has no motion.
- **Approve and send stays blue while sending** (#330): it says it is busy instead of greying out,
  and a spinner replaces its icon only once the send passes 150ms.
- **Sheets, toasts and menus are quicker** (#330). The details sheet and the phone menu rise in
  300ms and leave in 200ms, with no blur over the screen (they took 500ms over a full-screen
  blur). Toasts enter in 260ms and leave in 180ms, from 500ms both ways. Menus leave in 100ms.
- **Reduced motion is honoured everywhere** (#330). Under the system's reduced-motion setting
  every motion becomes a 150ms cross-fade or none, the kit's overlays included; the E2E suite runs
  that way, so no test sees a frame mid-animation.

The new Vietnamese wording waits on a native read (#78): "Không có khách nào đang chờ bạn. Khách
nhắn tiếp theo sẽ hiện ở đây.", "Tin trả lời gần nhất: gửi cho {name} lúc {time}", "Tiếp theo:
{name}, đã chờ {duration}", "Gửi không thành công. Tin trả lời của bạn vẫn còn đây." and "Tin trả
lời của bạn vẫn còn đây."
