## 2026-10-08 (The open thread: conversation, docked reply box, guest details beside it)

### Changed

- **The open thread is a workbench** (#248). Messages are chat bubbles, the guest's on the left with the translation as a muted second line inside the bubble, the office's on the right, with the source and time under each. The reply box is docked under the conversation and always in view, with Approve and send in it, and the conversation opens on the latest message. The guest's details sit in a rail beside the conversation (details and what is missing, the CRM status, the owner); when the thread's own pane is narrower than 56rem (1366px with the sidebar open, a phone) the rail folds into a strip under the header, and the CRM status and Assign to move into the header.
- **A new guest message no longer pulls an operator reading older ones** (#248, PR #258). The conversation follows new messages only while the operator is at the latest; scrolled up, it stays put and a "New message" pill above the reply box takes them down to it. Opening a thread and the operator's own send still go to the latest.
- **The operator note is one line beside "Reply"** (#248): the reply's language and "don't interview" ("in Korean · don't interview"). The guest's facts and the paperwork flag it used to repeat are in the details.
- **Assign to and the manager's Showing filter are the kit's Select** (#248), showing the current choice, with the office's operators in the same order as a row's Assign to… menu. A new lint rule, `nhip/no-native-select`, refuses a native `<select>` outside `packages/ui`.
