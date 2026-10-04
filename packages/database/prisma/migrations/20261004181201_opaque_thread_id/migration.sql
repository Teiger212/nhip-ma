-- A thread's id is opaque, never the guest's phone or Zalo id (#141, ADR 0010 amended).
-- Hand-made: it changes data only, so `migrate:new` (a schema diff) writes nothing for it.
-- One deploy, pre-launch: production never deployed and staging holds test data only. The code
-- before it finds a thread by (office, pipe, guest), never by its id's shape, so it keeps working.

-- Every thread takes an opaque id. The six foreign keys to "inbox_conversation" ("id",
-- "officeId") are ON UPDATE CASCADE (20261004074733_office_on_every_row): every message,
-- Answer, qualification, draft, paperwork and CRM link follows its thread.
UPDATE "inbox_conversation" SET "id" = gen_random_uuid()::text;

-- The mock CRM's leads link to their thread by id: point each linked lead at its thread's new
-- id. HubSpot deals made before this keep their stale links (accepted, test data).
UPDATE "inbox_mock_crm_lead" AS "lead"
SET "threadUrl" = regexp_replace("lead"."threadUrl", '([?&]thread=)[^&#]*', '\1' || "link"."conversationId")
FROM "inbox_crm_link" AS "link"
WHERE "link"."leadId" = "lead"."id" AND "link"."officeId" = "lead"."officeId";

-- Vendor message ids are stored keyed and hashed from now on (HMAC-SHA256 under a key derived
-- from BETTER_AUTH_SECRET, `packages/database/inbox/vendor-id.ts`). SQL has no such key, and an
-- unkeyed hash of a phone-bearing id can be reversed by trying every number, so the raw ids
-- already stored are cleared rather than hashed. Nothing reads them back; the cost is that a
-- vendor retry of a message stored before this is filed once more.
UPDATE "inbox_message" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_answer" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_webhook_delivery" SET "vendorMessageIds" = '{}' WHERE cardinality("vendorMessageIds") > 0;
