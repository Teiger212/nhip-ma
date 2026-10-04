-- A thread's id is opaque, never the guest's phone or Zalo id (#141, ADR 0010 amended).
-- Hand-made: it changes data only, so `migrate:new` (a schema diff) writes nothing for it.
-- One deploy, pre-launch: production never deployed and staging holds test data only. The code
-- before it still finds a thread by (office, pipe, guest), but while it serves (the deploy
-- window) it creates `office:pipe:guest` ids and writes raw vendor ids that this migration
-- never sees; on staging a few such rows may remain. Vercel's instant rollback to a deployment
-- from before #141 is unsafe from here (with `20261004182359_drop_answer_to`, its approvals fail).

-- Every thread takes an opaque id (a UUID here; new threads take a cuid). The six foreign keys
-- to "inbox_conversation" ("id", "officeId") are ON UPDATE CASCADE
-- (20261004074733_office_on_every_row): every message, Answer, qualification, draft,
-- paperwork and CRM link follows its thread.
UPDATE "inbox_conversation" SET "id" = gen_random_uuid()::text;

-- A mock CRM lead links to the thread that created it. Through that thread's CRM link (method
-- `created`; a lead found again by phone or Zalo id keeps its creator's link), point the lead
-- at the thread's new id. A lead whose creating thread is gone keeps its old link (its row
-- holds the guest's phone anyway); HubSpot deals made before this keep their stale links.
-- Both are accepted: test data.
UPDATE "inbox_mock_crm_lead" AS "lead"
SET "threadUrl" = regexp_replace("lead"."threadUrl", '([?&]thread=)[^&#]*', '\1' || "link"."conversationId")
FROM "inbox_crm_link" AS "link"
WHERE "link"."leadId" = "lead"."id"
	AND "link"."officeId" = "lead"."officeId"
	AND "link"."method" = 'created';

-- Vendor message ids are stored keyed and hashed from now on (HMAC-SHA256 under a key derived
-- from BETTER_AUTH_SECRET, `packages/database/inbox/vendor-id.ts`). The stored value's only
-- reader is the duplicate check, which compares the app's HMAC: nothing SQL can compute here
-- would ever match it, so hashing in place would act exactly like NULL while still holding a
-- derivative of the raw id. The raw ids already stored are cleared instead. Nothing reads them
-- back; the cost is that a vendor retry of a message stored before this is filed once more.
UPDATE "inbox_message" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_answer" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_webhook_delivery" SET "vendorMessageIds" = '{}' WHERE cardinality("vendorMessageIds") > 0;
