import { createHmac } from "node:crypto";

import { expect, test } from "vitest";

import { readMockCrmWebhook } from "./mock-webhook";

const SECRET = "test-only-mock-crm-secret";
const body = JSON.stringify({ officeId: "office-a", leadIds: ["lead-1", "lead-2"] });
const sign = (raw: string, secret = SECRET) =>
	`sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;

// Spec #59 (#63): the mock CRM's notice is trusted only when signed with the deployment's secret.
test("a signed notice names the office and its changed leads", () => {
	expect(readMockCrmWebhook(body, sign(body), SECRET)).toEqual({
		officeId: "office-a",
		leadIds: ["lead-1", "lead-2"],
	});
});

test("an unsigned, wrongly signed or tampered notice is refused", () => {
	expect(readMockCrmWebhook(body, null, SECRET)).toBeNull();
	expect(readMockCrmWebhook(body, sign(body, "another-secret"), SECRET)).toBeNull();
	expect(readMockCrmWebhook(body.replace("lead-2", "lead-3"), sign(body), SECRET)).toBeNull();
	expect(readMockCrmWebhook(body, "sha256=not-hex", SECRET)).toBeNull();
});

test("a signed notice that is not the expected shape is refused", () => {
	const odd = JSON.stringify({ officeId: "office-a", leadIds: "lead-1" });
	expect(readMockCrmWebhook(odd, sign(odd), SECRET)).toBeNull();
	expect(readMockCrmWebhook("not json", sign("not json"), SECRET)).toBeNull();
});
