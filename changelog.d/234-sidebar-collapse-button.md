## 2026-10-07 (a visible sidebar collapse button, smoother motion, a readable icon strip)

### Added

- **A button collapses and expands the sidebar on a desktop** (#234). It sits beside the bell, and heads the icon strip when the sidebar is collapsed. Its tooltip says what it does and gives the shortcut as the computer writes it: "Collapse sidebar (⌘B)" on a Mac, "(Ctrl+B)" elsewhere, in English and Vietnamese. ⌘B / Ctrl+B and the rail on the sidebar's edge still work as before.

### Changed

- **The sidebar moves smoothly** (#234). Its width eases out over 220ms instead of moving linearly, and the labels fade with it instead of vanishing at once. Both stop when the system asks for reduced motion.
- **The collapsed icon strip reads on its own** (#234). Every item has a tooltip naming it, International included: it still says "Coming soon" and links nowhere. The Inbox's Your-turn count stays on the Inbox icon as a small badge. The user menu fits the strip instead of overhanging its edge.

### Fixed

- **A collapsed sidebar reloads collapsed from the first frame** (#234). The server reads the sidebar's cookie, so the page no longer paints the open sidebar and then snaps it shut.
