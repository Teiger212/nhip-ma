## 2026-10-09 (admin follow-ups)

### Changed

- **Impersonate is gone from Admin → Users** (#299). The row menu no longer offers it: impersonating opens an office's guest data as that person. The Better Auth admin plugin stays; `KIT_SCREENS.impersonate` flips it back on.
- **Office member counts leave out the platform admin** (#299). Admin → Offices counts an office's own people.
- **The main button of each account and office form is the primary blue** (#299): name, email, password, passkeys, "Display name", office name and the onboarding account step.
- **The Connections card says how WhatsApp is set up** (#299). "On Nhịp's number" when the deployment has a WhatsApp number configured, "Not connected" when it has none; it follows configuration only, never messages.
