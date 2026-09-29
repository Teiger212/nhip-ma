import { expect, test } from "vitest";

import { MAX_MESSAGE_LENGTH, scrubProperties, scrubText, scrubUrl } from "./scrub";

test("phone numbers and emails never survive, in any common format", () => {
	for (const phone of ["+84 912 345 678", "0912345678", "(028) 3822-9999", "+1-631-555-1181"]) {
		expect(scrubText(`guest ${phone} wrote`), phone).toBe("guest [phone] wrote");
	}
	expect(scrubText("from yuki.tanaka+apt@example.co.jp")).toBe("from [email]");
});

test("long messages are capped, so quoted guest text is cut short", () => {
	const scrubbed = scrubText("x ".repeat(500));
	expect(scrubbed.length).toBeLessThan(MAX_MESSAGE_LENGTH + 20);
	expect(scrubbed).toMatch(/\[truncated\]$/);
});

test("URLs keep their path and lose their query and fragment", () => {
	expect(
		scrubUrl("https://nhip-staging.vercel.app/en/signup?invitationId=abc&email=a@b.co#x"),
	).toBe("https://nhip-staging.vercel.app/en/signup");
	expect(scrubUrl("/api/conversations?locale=vi")).toBe("/api/conversations");
});

test("properties: personal keys dropped, URLs cut, strings scrubbed, nesting walked", () => {
	expect(
		scrubProperties({
			$ip: "113.161.1.1",
			$current_url: "https://app/en/inbox?q=Minji",
			reply: "Hello Minji, the apartment is free",
			$exception_list: [{ type: "TypeError", value: "cannot read 0912345678 of undefined" }],
			route: "/api/conversations/[id]/approve",
		}),
	).toEqual({
		$current_url: "https://app/en/inbox",
		$exception_list: [{ type: "TypeError", value: "cannot read [phone] of undefined" }],
		route: "/api/conversations/[id]/approve",
	});
});
