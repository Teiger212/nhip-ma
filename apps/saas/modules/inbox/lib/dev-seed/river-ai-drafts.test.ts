import { expect, test } from "vitest";

import { MODEL_DEFAULTS } from "../config";
import { checkFollowUp } from "../drafts/guardrails";
import { riverDraftRequests } from "./draft-requests";
import { RIVER_AI_DRAFTS } from "./river-ai-drafts";

/**
 * ADR 0024: the model writes the suggested reply with the draft default (Haiku 5.5), and the
 * post-check lets only a draft through that states no answer and writes no number nobody in the
 * thread wrote. The river office's seeded model drafts are committed fixtures (#302); this is the
 * cheap guard against a hand edit that puts another model's name, or a blocked text, on them.
 */

const fixtureReplies = new Map(
	Object.entries(RIVER_AI_DRAFTS.drafts).map(([key, draft]) => [key, draft.reply]),
);

test("the fixtures record the draft default model, not a local override", () => {
	expect(RIVER_AI_DRAFTS.model).toBe(MODEL_DEFAULTS.draft.model);
	expect(RIVER_AI_DRAFTS.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
});

test("every model draft the river story plays has a fixture the post-check passes", () => {
	const requests = riverDraftRequests(Date.now(), fixtureReplies);
	expect(requests.length).toBeGreaterThanOrEqual(5);
	for (const request of requests) {
		const fixture = RIVER_AI_DRAFTS.drafts[request.fixture];
		expect(fixture, `${request.fixture} has no fixture`).toBeDefined();
		expect(checkFollowUp(fixture.reply, request.written), `${request.fixture} reply`).toBeTruthy();
		expect(
			checkFollowUp(fixture.officeReply, request.written),
			`${request.fixture} operator line`,
		).toBeTruthy();
	}
	// A fixture no story step plays is a stale one.
	expect(Object.keys(RIVER_AI_DRAFTS.drafts).sort()).toEqual(
		requests.map((request) => request.fixture).sort(),
	);
});
