import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { errorKind } from "@shared/lib/scrub";

import { costOf, estimateTokens, formatUsd } from "../evals/cost";
import { DEFAULT_DRAFT_BASE_URL, MODEL_DEFAULTS } from "../lib/config";
import { riverDraftRequests } from "../lib/dev-seed/draft-requests";
import {
	type AiDraftFixture,
	type AiDraftFixtures,
	RIVER_AI_DRAFTS,
} from "../lib/dev-seed/river-ai-drafts";
import { checkFollowUp, parseModelDraft } from "../lib/drafts/guardrails";
import { MODEL_TIMEOUT_MS, officeDay } from "../lib/drafts/layer";
import { createOpenRouterBackends } from "../lib/drafts/openrouter";
import { followUpSystemPrompt, followUpUserPrompt } from "../lib/drafts/prompts";
import { STUB_MODEL, stubBackends } from "../lib/drafts/stub";

/**
 * The river office's model drafts, written once by the real model (#302, ADR 0024):
 *
 *   pnpm seed:drafts [--dry-run | --stub]
 *
 * For every conversation of the river office's story that has a model draft (`repliesAi`,
 * `draftWaits`), it builds the request the app builds (`generateModelDraft`: the same prompts,
 * the last 10 messages, the extracted details), calls the model FORCED to the draft default
 * (`MODEL_DEFAULTS.draft.model`, whatever `DRAFT_MODEL` says locally) through the app's
 * OpenRouter client (zero-retention routing, its reasoning and token settings), runs both texts
 * through the app's post-check (`checkFollowUp`) and writes the passing ones to
 * `lib/dev-seed/river-ai-drafts.ts`. A draft the post-check blocks is asked for once more, then
 * reported and not written. `--dry-run` builds every request and spends nothing; `--stub` writes
 * E2E's stub model's text into the fixture file, labelled `stub`. A real run reads
 * `DRAFT_API_KEY` from the env (via the root script) and never prints it.
 */

const FIXTURE_FILE = join(
	dirname(fileURLToPath(import.meta.url)),
	"../lib/dev-seed/river-ai-drafts.ts",
);
/** A draft's two texts as JSON: a generous output estimate, as the eval's. */
const OUTPUT_ESTIMATE = 300;

function render(fixtures: AiDraftFixtures): string {
	const body = JSON.stringify(fixtures.drafts, null, "\t").replace(/^/gmu, "\t").trimStart();
	return `/**
 * The river office's model drafts (#302, ADR 0024): written once by the real draft model, from
 * the same prompt and thread context the app builds, kept only when the post-check passed them.
 * \`pnpm seed\` plays these as the model's drafts and calls no model. Generated, not hand-written:
 * \`pnpm seed:drafts\` (see \`scripts/generate-demo-drafts.ts\`) rewrites this file.
 */
export type AiDraftFixture = {
	/** The reply, in the guest's language (English for one Nhịp doesn't support). */
	reply: string;
	/** The same reply in the office language, the operator line. */
	officeReply: string;
};

export type AiDraftFixtures = {
	/** The model that wrote the drafts: always the draft default (ADR 0024), never a local override. */
	model: string;
	/** The day they were generated, YYYY-MM-DD. */
	generatedAt: string;
	drafts: Record<string, AiDraftFixture>;
};

export const RIVER_AI_DRAFTS: AiDraftFixtures = {
	model: ${JSON.stringify(fixtures.model)},
	generatedAt: ${JSON.stringify(fixtures.generatedAt)},
	drafts: ${body},
};
`;
}

async function main(): Promise<void> {
	if (process.env.CI) {
		throw new Error("seed:drafts calls a paid model and runs by hand only, never in CI (#302).");
	}
	const args = process.argv.slice(2).filter((arg) => arg !== "--");
	const unknown = args.filter((arg) => arg !== "--dry-run" && arg !== "--stub");
	if (unknown.length > 0)
		throw new Error(`unknown option ${unknown[0]}\nusage: seed:drafts [--dry-run | --stub]`);
	const dryRun = args.includes("--dry-run");
	const stub = args.includes("--stub");
	// Forced: the owner's local DRAFT_MODEL may be another model, and the fixtures are Haiku's.
	const model = stub ? STUB_MODEL : MODEL_DEFAULTS.draft.model;

	const sentReplies = new Map<string, string>();
	const list = riverDraftRequests(Date.now(), sentReplies);
	const estimate = list.reduce(
		(sum, job) => {
			const prompt = `${followUpSystemPrompt(job.input.guestLanguage, job.input.officeLanguage)}\n${followUpUserPrompt(job.input)}`;
			const input = estimateTokens(prompt);
			return {
				input: sum.input + input,
				cost: sum.cost + (costOf(model, input, OUTPUT_ESTIMATE) ?? 0),
			};
		},
		{ input: 0, cost: 0 },
	);
	console.info(
		`${list.length} drafts with ${model}: ~${estimate.input} input tokens, about ${formatUsd(estimate.cost)} (a high estimate).`,
	);
	if (dryRun) {
		for (const job of list) {
			console.info(
				`  ${job.fixture} (${job.guest}, ${job.input.guestLanguage}): ${job.input.messages.length} messages`,
			);
		}
		return;
	}

	let backend = stubBackends.draft;
	if (!stub) {
		const apiKey = process.env.DRAFT_API_KEY?.trim();
		if (!apiKey)
			throw new Error("DRAFT_API_KEY is not set: a real run needs it (or use --dry-run or --stub)");
		const baseUrl = process.env.DRAFT_BASE_URL?.trim() || DEFAULT_DRAFT_BASE_URL;
		if (new URL(baseUrl).hostname !== "openrouter.ai") {
			throw new Error("DRAFT_BASE_URL is not OpenRouter: unset it for seed:drafts");
		}
		backend = createOpenRouterBackends({
			apiKey,
			baseUrl,
			models: { draft: model, translate: model },
		}).draft;
	}

	// Earlier fixtures kept when a re-run only fixes some; a stub run never mixes with real ones.
	const kept = stub || RIVER_AI_DRAFTS.model !== model ? {} : RIVER_AI_DRAFTS.drafts;
	const drafts: Record<string, AiDraftFixture> = { ...kept };
	let spent = 0;
	let costKnown = true;
	const failed: string[] = [];
	for (const job of list) {
		let result: AiDraftFixture | null = null;
		for (let attempt = 1; attempt <= 2 && !result; attempt += 1) {
			let text: string | null = null;
			try {
				const reply = await backend.run(job.input, AbortSignal.timeout(MODEL_TIMEOUT_MS));
				if (reply.outcome === "ok") text = reply.text;
				if ("inputTokens" in reply && reply.inputTokens !== null && reply.outputTokens !== null) {
					spent += costOf(model, reply.inputTokens, reply.outputTokens) ?? 0;
				} else costKnown = false;
				if (reply.outcome !== "ok") console.info(`  ${job.fixture}: ${reply.outcome}`);
			} catch (error) {
				console.info(`  ${job.fixture}: error (${errorKind(error)})`);
			}
			const drafted = parseModelDraft(text);
			const reply = checkFollowUp(drafted?.reply, job.written);
			const officeReply = checkFollowUp(drafted?.officeReply, job.written);
			if (reply && officeReply) result = { reply, officeReply };
			else
				console.info(
					`  ${job.fixture} (${job.guest}): blocked by the post-check, attempt ${attempt}`,
				);
		}
		if (result) {
			drafts[job.fixture] = result;
			sentReplies.set(job.fixture, result.reply);
			console.info(`  ${job.fixture} (${job.guest}): ok`);
		} else failed.push(job.fixture);
	}

	const fixtures: AiDraftFixtures = {
		model,
		generatedAt: officeDay(new Date()),
		drafts,
	};
	writeFileSync(FIXTURE_FILE, render(fixtures));
	console.info(
		`Wrote ${Object.keys(drafts).length} drafts to river-ai-drafts.ts. Spent ${costKnown ? formatUsd(spent) : `at least ${formatUsd(spent)}`}.`,
	);
	if (failed.length > 0) {
		console.error(
			`Blocked, not written: ${failed.join(", ")}. Regenerate or pick another conversation.`,
		);
		process.exitCode = 1;
	}
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
