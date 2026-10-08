import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { errorKind } from "@shared/lib/scrub";

import {
	costOf,
	estimateTokens,
	formatUsd,
	THINKING_MARGIN_TOKENS,
	thinksAsOutput,
} from "../evals/cost";
import { checkDraft } from "../evals/draft-checks";
import { draftEvalThreads } from "../evals/draft-threads";
import {
	type CallResult,
	draftReport,
	type DraftRow,
	type Mode,
	translationReport,
	type TranslationRow,
} from "../evals/report";
import { translationPairs } from "../evals/translation-pairs";
import { DEFAULT_DRAFT_BASE_URL, MODEL_DEFAULTS } from "../lib/config";
import { DEMO_OFFICE_NAME, RIVER_OFFICE_NAME } from "../lib/demo-user";
import { checkFollowUp } from "../lib/drafts/guardrails";
import { MODEL_TIMEOUT_MS, officeDay, type Attempt, type TaskBackend } from "../lib/drafts/layer";
import { createOpenRouterBackends } from "../lib/drafts/openrouter";
import {
	followUpSystemPrompt,
	followUpUserPrompt,
	translationSystemPrompt,
	translationUserPrompt,
} from "../lib/drafts/prompts";
import { STUB_MODEL, stubBackends } from "../lib/drafts/stub";
import type { OperatorLanguage } from "../lib/types";

/**
 * The evals (#254, ADR 0024 "Models"), on demand only: real OpenRouter calls cost money, so
 * nothing in CI or the tests runs this. One script, two evals:
 *
 *   pnpm eval:drafts [--dry-run | --stub] [--office-language en|vi] [--model <id>] [--out <file>]
 *   pnpm eval:translation [--dry-run | --stub] [--models <id>,<id>] [--out <file>]
 *
 * `--dry-run` builds every prompt and prints the estimate without calling anything; `--stub`
 * answers with E2E's stub model. A real run reads `DRAFT_API_KEY` (and `DRAFT_BASE_URL`, else
 * OpenRouter) from the env, prints the estimated cost first, then calls each model through the
 * app's OpenRouter client (zero-retention routing, the app's prompts) and writes a Markdown report
 * under `reports/evals/`. The key is never printed.
 */

const TRANSLATION_MODELS = [MODEL_DEFAULTS.translate.model, "google/gemini-3.1-flash-lite"];
/** Two calls at a time: fast enough, and latencies stay honest. */
const CONCURRENCY = 2;
/** A draft's two texts, up to 4 sentences each, as JSON: a generous output estimate. */
const DRAFT_OUTPUT_ESTIMATE = 300;

type Options = {
	eval: "drafts" | "translation";
	mode: Mode;
	officeLanguage: OperatorLanguage;
	draftModel: string;
	translationModels: string[];
	out: string | null;
};

const USAGE =
	"usage: eval.ts drafts|translation [--dry-run | --stub] [--office-language en|vi] [--model <id>] [--models <id>,<id>] [--out <file>]";

function parseOptions(argv: string[]): Options {
	// pnpm may pass its `--` separator through.
	const args = argv.filter((arg) => arg !== "--");
	const [which, ...rest] = args;
	if (which !== "drafts" && which !== "translation") throw new Error(USAGE);
	const options: Options = {
		eval: which,
		mode: "real",
		officeLanguage: "en",
		draftModel: MODEL_DEFAULTS.draft.model,
		translationModels: TRANSLATION_MODELS,
		out: null,
	};
	for (let index = 0; index < rest.length; index += 1) {
		const [flag, inline] = rest[index].split("=", 2);
		const value = () => {
			const found = inline ?? rest[++index];
			if (!found) throw new Error(`${flag} needs a value\n${USAGE}`);
			return found;
		};
		if (flag === "--dry-run") options.mode = "dry-run";
		else if (flag === "--stub") options.mode = "stub";
		else if (flag === "--office-language") {
			const language = value();
			if (language !== "en" && language !== "vi") throw new Error("--office-language is en or vi");
			options.officeLanguage = language;
		} else if (flag === "--model") options.draftModel = value();
		else if (flag === "--models") options.translationModels = value().split(",").filter(Boolean);
		else if (flag === "--out") options.out = resolve(value());
		else throw new Error(`unknown option ${flag}\n${USAGE}`);
	}
	return options;
}

function repoRoot(): string {
	let dir = process.cwd();
	while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
		const parent = dirname(dir);
		if (parent === dir) return process.cwd();
		dir = parent;
	}
	return dir;
}

async function inPool<T, R>(items: T[], run: (item: T, index: number) => Promise<R>): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const index = next++;
			results[index] = await run(items[index], index);
		}
	}
	await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, worker));
	return results;
}

type Estimate = CallResult["estimate"];

function estimateFor(model: string, prompt: string, output: number): Estimate {
	const inputTokens = estimateTokens(prompt);
	const outputTokens = output + (thinksAsOutput(model) ? THINKING_MARGIN_TOKENS : 0);
	return { inputTokens, outputTokens, costUsd: costOf(model, inputTokens, outputTokens) };
}

function notCalled(model: string, estimate: Estimate): CallResult {
	return {
		model,
		outcome: "not called",
		text: null,
		inputTokens: null,
		outputTokens: null,
		latencyMs: null,
		costUsd: null,
		estimate,
	};
}

/** One call through the app's backend: the 20 s timeout, no retry, every outcome recorded. */
async function call<Input>(
	backend: TaskBackend<Input>,
	input: Input,
	estimate: Estimate,
): Promise<CallResult> {
	const started = performance.now();
	let attempt: Attempt | { outcome: "timeout" };
	try {
		attempt = await backend.run(input, AbortSignal.timeout(MODEL_TIMEOUT_MS));
	} catch (error) {
		attempt =
			(error as { name?: unknown })?.name === "TimeoutError"
				? { outcome: "timeout" }
				: { outcome: "error", kind: errorKind(error) };
	}
	const latencyMs = Math.round(performance.now() - started);
	const base = { ...notCalled(backend.model, estimate), latencyMs };
	if (attempt.outcome === "timeout") return { ...base, outcome: "timeout" };
	if (attempt.outcome === "error") {
		return { ...base, outcome: "error", detail: String(attempt.status ?? attempt.kind ?? "") };
	}
	const { inputTokens, outputTokens } = attempt;
	return {
		...base,
		outcome: attempt.outcome,
		text: attempt.outcome === "ok" ? attempt.text : null,
		inputTokens,
		outputTokens,
		costUsd:
			inputTokens === null || outputTokens === null
				? null
				: costOf(backend.model, inputTokens, outputTokens),
	};
}

function sumEstimates(estimates: Estimate[]) {
	const known = estimates.every((estimate) => estimate.costUsd !== null);
	return {
		input: estimates.reduce((sum, estimate) => sum + estimate.inputTokens, 0),
		output: estimates.reduce((sum, estimate) => sum + estimate.outputTokens, 0),
		cost: known ? estimates.reduce((sum, estimate) => sum + (estimate.costUsd ?? 0), 0) : null,
	};
}

function backendsFor(options: Options, model: string) {
	if (options.mode === "stub") return stubBackends;
	const apiKey = process.env.DRAFT_API_KEY?.trim();
	if (!apiKey)
		throw new Error("DRAFT_API_KEY is not set: a real run needs it (or use --dry-run or --stub)");
	const baseUrl = process.env.DRAFT_BASE_URL?.trim() || DEFAULT_DRAFT_BASE_URL;
	// The eval measures what production calls: OpenRouter, with its zero-retention routing.
	if (new URL(baseUrl).hostname !== "openrouter.ai") {
		throw new Error("DRAFT_BASE_URL is not OpenRouter: unset it for the eval");
	}
	return createOpenRouterBackends({
		apiKey,
		baseUrl,
		models: { draft: model, translate: model },
	});
}

function announce(options: Options, what: string, estimates: Estimate[]): void {
	const sum = sumEstimates(estimates);
	const where =
		options.mode === "real"
			? `through ${new URL(process.env.DRAFT_BASE_URL?.trim() || DEFAULT_DRAFT_BASE_URL).host} (zero-retention)`
			: options.mode === "stub"
				? "answered by the stub model"
				: "none made (dry run)";
	console.info(`${what}: ${estimates.length} calls, ${where}.`);
	console.info(
		`Estimated: ~${sum.input} input / ~${sum.output} output tokens, about ${formatUsd(sum.cost)} (a high estimate).`,
	);
}

function write(
	options: Options,
	kind: "drafts" | "translations",
	report: string,
	date: string,
): string {
	const suffix = options.mode === "real" ? "" : `-${options.mode}`;
	const path = options.out ?? join(repoRoot(), "reports", "evals", `${date}-${kind}${suffix}.md`);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, report);
	return path;
}

async function draftEval(options: Options, date: string): Promise<void> {
	const threads = draftEvalThreads(options.officeLanguage, Date.now());
	const model = options.mode === "stub" ? STUB_MODEL : options.draftModel;
	const prompts = threads.map((thread) => ({
		system: followUpSystemPrompt(thread.input.guestLanguage, thread.input.officeLanguage),
		user: followUpUserPrompt(thread.input),
	}));
	const estimates = prompts.map((prompt) =>
		estimateFor(model, `${prompt.system}\n${prompt.user}`, DRAFT_OUTPUT_ESTIMATE),
	);
	announce(options, `Draft eval with ${model}`, estimates);

	const backend = options.mode === "dry-run" ? null : backendsFor(options, model).draft;
	const rows = await inPool(threads, async (thread, index): Promise<DraftRow> => {
		const prompt = prompts[index];
		const row = { thread, systemPrompt: prompt.system, userPrompt: prompt.user };
		if (!backend)
			return { ...row, call: notCalled(model, estimates[index]), check: null, appPasses: null };
		const result = await call(backend, thread.input, estimates[index]);
		console.info(`  ${index + 1}/${threads.length} ${thread.id}: ${result.outcome}`);
		const check = checkDraft(result.text, {
			messages: thread.messages,
			officeNames: [DEMO_OFFICE_NAME, RIVER_OFFICE_NAME],
		});
		const guestTexts = thread.messages
			.filter((message) => message.direction === "in")
			.map((message) => message.text);
		const appPasses = Boolean(
			check.draft &&
			checkFollowUp(check.draft.reply, guestTexts) &&
			checkFollowUp(check.draft.officeReply, guestTexts),
		);
		return { ...row, call: result, check, appPasses };
	});

	const report = draftReport({
		rows,
		mode: options.mode,
		date,
		model,
		officeLanguage: options.officeLanguage,
	});
	const path = write(options, "drafts", report, date);
	if (options.mode !== "dry-run") {
		const spent = rows.reduce((sum, row) => sum + (row.call.costUsd ?? 0), 0);
		const passed = rows.filter((row) => row.check?.pass).length;
		console.info(
			`Spent ${formatUsd(spent)}. ${passed} of ${rows.length} drafts pass every local check.`,
		);
	}
	console.info(`Report: ${path}`);
}

async function translationEval(options: Options, date: string): Promise<void> {
	const pairs = translationPairs();
	const models = options.mode === "stub" ? [STUB_MODEL] : options.translationModels;
	const jobs = pairs.flatMap((pair, pairIndex) =>
		models.map((model) => {
			const input = { officeId: pair.office, text: pair.text, from: pair.from, to: pair.to };
			const prompt = `${translationSystemPrompt(pair.to)}\n${translationUserPrompt(input)}`;
			return {
				pairIndex,
				model,
				input,
				estimate: estimateFor(model, prompt, estimateTokens(pair.text) + 20),
			};
		}),
	);
	announce(
		options,
		`Translation eval, ${pairs.length} pairs with ${models.join(" and ")}`,
		jobs.map((job) => job.estimate),
	);

	const backends =
		options.mode === "dry-run"
			? null
			: Object.fromEntries(models.map((model) => [model, backendsFor(options, model).translate]));
	let done = 0;
	const results = await inPool(jobs, async (job) => {
		if (!backends) return notCalled(job.model, job.estimate);
		const result = await call(backends[job.model], job.input, job.estimate);
		done += 1;
		if (result.outcome !== "ok" || done % 10 === 0 || done === jobs.length) {
			console.info(`  ${done}/${jobs.length} (${job.model}: ${result.outcome})`);
		}
		return result;
	});
	const rows: TranslationRow[] = pairs.map((pair, index) => ({
		pair,
		calls: results.filter((_, jobIndex) => jobs[jobIndex].pairIndex === index),
	}));

	const report = translationReport({
		rows,
		mode: options.mode,
		date,
		models,
		systemPrompts: { en: translationSystemPrompt("en"), vi: translationSystemPrompt("vi") },
	});
	const path = write(options, "translations", report, date);
	if (options.mode !== "dry-run") {
		for (const model of models) {
			const calls = results.filter((result) => result.model === model);
			const spent = calls.reduce((sum, result) => sum + (result.costUsd ?? 0), 0);
			const ok = calls.filter((result) => result.outcome === "ok").length;
			console.info(`${model}: ${ok} of ${calls.length} answered, spent ${formatUsd(spent)}.`);
		}
	}
	console.info(`Report: ${path}`);
}

async function main(): Promise<void> {
	if (process.env.CI) {
		throw new Error("The evals call a paid model and run by hand only, never in CI (#254).");
	}
	const options = parseOptions(process.argv.slice(2));
	const date = officeDay(new Date());
	if (options.eval === "drafts") await draftEval(options, date);
	else await translationEval(options, date);
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exitCode = 1;
});
