## 2026-10-08 (In CRM opens the HubSpot deal)

### Added

- **In CRM opens the thread's deal in HubSpot** (#240, ADR 0003). On an office on HubSpot, the
  thread header's "In CRM" badge is a link, with a small external-link icon, that opens the deal
  in a new tab on the portal's own web domain (an EU-hosted portal's is `app-eu1.hubspot.com`).
  Nhịp learns the domain from HubSpot's account details along with the portal id, and keeps it
  on the CRM connection. Until it knows them, and on the mock CRM, the badge stays plain text.
