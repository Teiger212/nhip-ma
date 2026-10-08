import { expect, test } from "vitest";

import { checkFollowUp, parseModelDraft } from "./guardrails";
import { STUB_DRAFT, stubDraft } from "./stub";

/**
 * The E2E stub model's draft (ADR 0024, #251) answers in the model's JSON, and the post-check
 * treats it as it would a model's: its usual draft passes in both office languages, and the
 * pink-book guest's is blocked in both, so the template stands.
 */

const at = "2026-10-08T01:00:00.000Z";

for (const officeLanguage of ["en", "vi"] as const) {
	test(`in a ${officeLanguage} office the stub's draft passes and the pink-book answer is blocked`, () => {
		const guest = "Looking to rent in Tay Ho";
		const usual = parseModelDraft(
			stubDraft({
				officeLanguage,
				messages: [{ direction: "in", source: "guest", text: guest, at }],
			}),
		);
		expect(usual?.reply).toBe(STUB_DRAFT);
		expect(checkFollowUp(usual?.reply, [guest])).toBe(STUB_DRAFT);
		expect(checkFollowUp(usual?.officeReply, [guest])).toBe(usual?.officeReply);

		const asks = "Is the pink book ready?";
		const blocked = parseModelDraft(
			stubDraft({
				officeLanguage,
				messages: [{ direction: "in", source: "guest", text: asks, at }],
			}),
		);
		expect(blocked).not.toBeNull();
		expect(checkFollowUp(blocked?.reply, [asks])).toBeNull();
		expect(checkFollowUp(blocked?.officeReply, [asks])).toBeNull();
	});
}
