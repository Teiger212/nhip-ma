# Nhịp's HubSpot demo app

A HubSpot developer-platform project (static auth, private distribution) whose access token an
office's Connections card takes as its HubSpot credential (ADR 0003, #65). Static auth installs
on one standard account (the demo portal) plus up to ten test accounts, so this is the demo app
only; the production app is a separate OAuth app. Its auth type and distribution were fixed at
its first upload, hence the project name `nhip-demo`.

- Upload: `hs project upload` from this folder (account `nhip-hub`).
- Install: in HubSpot, Development → Projects → nhip-demo → the app → Distribution → Install
  (the demo portal, or a test account such as nhip-crm-dev).
- Token: the same Distribution tab, Show. Paste it into the office's Connections card; Nhịp
  stores it encrypted and never shows it back.
- Webhook (#66): `src/app/webhooks/webhooks-hsmeta.json` subscribes to a deal's `dealstage`
  changing (`crmObjects`, `object.propertyChange`), which is how Nhịp hears a deal won or lost.
  Its `targetUrl` is a placeholder: set it at the rehearsal (a tunnel's https URL) or at deploy
  to the deployment's `/webhooks/crm/hubspot`, and set that deployment's `HUBSPOT_WEBHOOK_URL` to
  exactly the same URL, since the signature covers it. `HUBSPOT_APP_CLIENT_SECRET` is the app's
  client secret (the app's Auth tab), which signs the webhooks. Upload again after changing it.
