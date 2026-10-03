import { createHmac } from "node:crypto";

import { expect, test } from "vitest";

import { readMockCrmWebhook } from "./mock-webhook";

const SECRET = "test-only-mock-crm-secret";
const body = JSON.stringify({ officeId: "office-a", leadIds: ["lead-1", "lead-2"] });
const sign = (raw: string, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

// ADR 0003 (2026-10-03 amendment): outcomes arrive by signed webhooks; nothing unsigned is trusted.
test("a signed notice names the office and its changed leads", () => {
	expect(readMockCrmWebhook(body, sign(body), SECRET)).toEqual({
		officeId: "office-a",
		leadIds: ["lead-1", "lead-2"],
	});
});

// ADR 0003: a notice that is not signed with the deployment's secret, or was changed after, is refused.
test("an unsigned, wrongly signed or tampered notice is refused", () => {
	expect(readMockCrmWebhook(body, null, SECRET)).toBeNull();
	expect(readMockCrmWebhook(body, sign(body, "another-secret"), SECRET)).toBeNull();
	expect(readMockCrmWebhook(body.replace("lead-2", "lead-3"), sign(body), SECRET)).toBeNull();
	expect(readMockCrmWebhook(body, "sha256=not-hex", SECRET)).toBeNull();
});

// ADR 0003: only a notice naming an office and its changed leads is read.
test("a signed notice that is not the expected shape is refused", () => {
	const odd = JSON.stringify({ officeId: "office-a", leadIds: "lead-1" });
	expect(readMockCrmWebhook(odd, sign(odd), SECRET)).toBeNull();
	expect(readMockCrmWebhook("not json", sign("not json"), SECRET)).toBeNull();
});
