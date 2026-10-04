-- A thread's id is opaque, never the guest's phone or Zalo id (#141, ADR 0010 amended).
-- Hand-made: it changes data only, so `migrate:new` (a schema diff) writes nothing for it.
-- One deploy, pre-launch: production never deployed and staging holds test data only. The code
-- before it still finds a thread by (office, pipe, guest), but while it serves (the deploy
-- window) it creates `office:pipe:guest` ids and writes raw vendor ids that this migration
-- never sees; on staging a few such rows may remain. Vercel's instant rollback to a deployment
-- from before #141 is unsafe from here (with `20261004182359_drop_answer_to`, its approvals fail).

-- Every thread takes an opaque id (a UUID here; new threads take a cuid). Old and new are kept
-- side by side first, so the mock CRM's links can be rewritten by the id they actually name.
CREATE TEMP TABLE "thread_rekey" AS
SELECT "id" AS "old", "officeId", gen_random_uuid()::text AS "new" FROM "inbox_conversation";

-- A mock CRM lead links to the thread that created it (`?thread=<id>`, the id URI-encoded); a
-- lead reused by another thread keeps that link. Point each at its thread's new id. HubSpot
-- deals made before this keep their stale links (accepted, test data).
UPDATE "inbox_mock_crm_lead" AS "lead"
SET "threadUrl" = regexp_replace("lead"."threadUrl", '([?&]thread=)[^&#]*', '\1' || "k"."new")
FROM "thread_rekey" AS "k"
WHERE "k"."officeId" = "lead"."officeId"
	AND replace(substring("lead"."threadUrl" FROM '[?&]thread=([^&#]*)'), '%3A', ':') = "k"."old";

-- The six foreign keys to "inbox_conversation" ("id", "officeId") are ON UPDATE CASCADE
-- (20261004074733_office_on_every_row): every message, Answer, qualification, draft,
-- paperwork and CRM link follows its thread.
UPDATE "inbox_conversation" AS "c" SET "id" = "k"."new" FROM "thread_rekey" AS "k" WHERE "c"."id" = "k"."old";

DROP TABLE "thread_rekey";

-- Vendor message ids are stored keyed and hashed from now on (HMAC-SHA256 under a key derived
-- from BETTER_AUTH_SECRET, `packages/database/inbox/vendor-id.ts`). The stored value's only
-- reader is the duplicate check, which compares the app's HMAC: nothing SQL can compute here
-- would ever match it, so hashing in place would act exactly like NULL while still holding a
-- derivative of the raw id. The raw ids already stored are cleared instead. Nothing reads them
-- back; the cost is that a vendor retry of a message stored before this is filed once more.
UPDATE "inbox_message" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_answer" SET "vendorMessageId" = NULL WHERE "vendorMessageId" IS NOT NULL;
UPDATE "inbox_webhook_delivery" SET "vendorMessageIds" = '{}' WHERE cardinality("vendorMessageIds") > 0;
