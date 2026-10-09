import { languageName } from "../lib/drafts/prompts";
import { formatUsd } from "./cost";
import { CHECK_LABELS, type CheckVerdict, type DraftCheck } from "./draft-checks";
import type { EvalThread } from "./draft-threads";
import type { TranslationPair } from "./translation-pairs";

/**
 * The eval reports Eyal reads (#254): Markdown under `reports/evals/`, one section per thread or
 * pair, each model's output next to its input, with tokens, latency and cost per call.
 */

export type Mode = "real" | "stub" | "dry-run";

export type CallResult = {
	model: string;
	outcome: "ok" | "filtered" | "empty" | "error" | "timeout" | "not called";
	text: string | null;
	inputTokens: number | null;
	outputTokens: number | null;
	latencyMs: number | null;
	costUsd: number | null;
	/** An error's HTTP status or kind, never its message. */
	detail?: string;
	/** Before the call: the estimate the run printed. */
	estimate: { inputTokens: number; outputTokens: number; costUsd: number | null };
};

const MODE_LINE: Record<Mode, string> = {
	real: "Real run: OpenRouter, zero-retention routing on every request.",
	stub: "Stub model (E2E's fixed text): no model called, nothing spent.",
	"dry-run": "Dry run: every prompt built, no model called. Tokens and costs are estimates.",
};

/** Text inside a table cell: no pipe breaks the row, no newline ends it. */
function cell(text: string): string {
	return text.replace(/\|/gu, "\\|").replace(/\r?\n/gu, "<br>");
}

function seconds(ms: number | null): string {
	return ms === null ? "n/a" : `${(ms / 1000).toFixed(1)} s`;
}

function median(values: number[]): number | null {
	if (!values.length) return null;
	const sorted = [...values].sort((a, b) => a - b);
	const middle = Math.floor(sorted.length / 2);
	return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** One call's numbers: measured, or estimated when nothing was called. */
export function callMeta(call: CallResult): string {
	if (call.outcome === "not called") {
		return `est. ~${call.estimate.inputTokens} in / ~${call.estimate.outputTokens} out tokens · est. ${formatUsd(call.estimate.costUsd)}`;
	}
	const tokens =
		call.inputTokens === null
			? "tokens n/a"
			: `${call.inputTokens} in / ${call.outputTokens ?? "?"} out tokens`;
	const outcome =
		call.outcome === "ok" ? "" : ` · **${call.outcome}${call.detail ? ` (${call.detail})` : ""}**`;
	return `${tokens} · ${seconds(call.latencyMs)} · ${formatUsd(call.costUsd)}${outcome}`;
}

type Totals = {
	calls: number;
	ok: number;
	input: number;
	output: number;
	cost: number | null;
	latencies: number[];
};

function totals(calls: CallResult[]): Totals {
	const called = calls.filter((call) => call.outcome !== "not called");
	const estimated = called.length === 0;
	const costs = calls.map((call) => (estimated ? call.estimate.costUsd : call.costUsd));
	return {
		calls: calls.length,
		ok: called.filter((call) => call.outcome === "ok").length,
		input: calls.reduce(
			(sum, call) => sum + (estimated ? call.estimate.inputTokens : (call.inputTokens ?? 0)),
			0,
		),
		output: calls.reduce(
			(sum, call) => sum + (estimated ? call.estimate.outputTokens : (call.outputTokens ?? 0)),
			0,
		),
		cost: costs.some((cost) => cost === null)
			? null
			: costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
		latencies: called.flatMap((call) => (call.latencyMs === null ? [] : [call.latencyMs])),
	};
}

function totalsLine(calls: CallResult[], mode: Mode): string {
	const sum = totals(calls);
	const est = mode === "dry-run" ? "est. " : "";
	const ok = mode === "dry-run" ? "" : ` (${sum.ok} answered)`;
	return `${sum.calls} calls${ok} · ${est}${sum.input} in / ${sum.output} out tokens · ${est}${formatUsd(sum.cost)} · median latency ${seconds(median(sum.latencies))}`;
}

function header(title: string, mode: Mode, date: string, lines: string[]): string[] {
	return [`# ${title} · ${date}`, "", MODE_LINE[mode], "", ...lines.map((line) => `- ${line}`), ""];
}

// The draft eval

export type DraftRow = {
	thread: EvalThread;
	call: CallResult;
	/** The local checks; null in a dry run. */
	check: DraftCheck | null;
	/** Whether the app's post-check (`checkFollowUp`) lets both texts through; null in a dry run. */
	appPasses: boolean | null;
	systemPrompt: string;
	userPrompt: string;
};

function mark(pass: boolean | null): string {
	if (pass === null) return "–";
	return pass ? "pass" : "**FAIL**";
}

function verdictsLine(verdicts: CheckVerdict[]): string {
	return verdicts
		.map(
			(verdict) =>
				`${mark(verdict.pass)} ${CHECK_LABELS[verdict.id]}${verdict.detail && verdict.pass === false ? ` (${verdict.detail})` : ""}`,
		)
		.join(" · ");
}

function who(message: EvalThread["input"]["messages"][number]): string {
	const at = message.at.slice(5, 16).replace("T", " ");
	if (message.direction === "in") return `Guest · ${at}`;
	return message.source === "auto-reply" ? `Auto-reply · ${at}` : `Agent · ${at}`;
}

export function draftReport(input: {
	rows: DraftRow[];
	mode: Mode;
	date: string;
	model: string;
	officeLanguage: "en" | "vi";
}): string {
	const { rows, mode } = input;
	const calls = rows.map((row) => row.call);
	const passed = rows.filter((row) => row.check?.pass).length;
	const lines = [
		...header("Draft eval", mode, input.date, [
			`Model: \`${input.model}\` · the office reply in ${languageName(input.officeLanguage)}`,
			`${rows.length} walk-office threads, each after the office's first human reply (ADR 0024: first replies stay the template)`,
			`Total: ${totalsLine(calls, mode)}`,
			...(mode === "dry-run"
				? []
				: [`Local checks: ${passed} of ${rows.length} drafts pass every check`]),
		]),
		"Local checks (#254): JSON shape, only numbers already in the thread (the guest's or the office's), asks nothing again (the office's open questions, or a detail the guest gave), no intro, at most 4 sentences. Each runs on both texts. **App post-check** is the app's own `checkFollowUp` (ADR 0024): where it blocks, the app shows the template instead.",
		"",
		"## Summary",
		"",
		"| # | Thread | Guest language | JSON | Numbers | Asks nothing again | Intro | ≤ 4 sentences | App post-check |",
		"| - | - | - | - | - | - | - | - | - |",
		...rows.map((row, index) => {
			const verdicts = row.check?.verdicts ?? [];
			const by = (id: CheckVerdict["id"]) =>
				mark(verdicts.find((each) => each.id === id)?.pass ?? null);
			const app = row.appPasses === null ? "–" : row.appPasses ? "shows it" : "**template**";
			return `| ${index + 1} | ${cell(row.thread.title)} | ${languageName(row.thread.input.guestLanguage)} | ${by("json")} | ${by("numbers")} | ${by("open-question")} | ${by("intro")} | ${by("length")} | ${app} |`;
		}),
		"",
		"<details><summary>The system prompt (thread 1's languages; each thread names its own)</summary>",
		"",
		"```text",
		rows[0]?.systemPrompt ?? "",
		"```",
		"",
		"</details>",
		"",
	];
	rows.forEach((row, index) => {
		const { thread, call, check } = row;
		const seen = thread.input.messages;
		const guestLanguage = languageName(thread.input.guestLanguage);
		lines.push(
			`## ${index + 1}. ${thread.title}`,
			"",
			`**Watch for:** ${thread.watch}`,
			"",
			`Guest language: ${guestLanguage} · open questions sent to the model: ${
				thread.input.openQuestions.length
					? thread.input.openQuestions.map((question) => `“${question}”`).join(", ")
					: "none"
			}`,
			"",
			`**Thread** (the ${seen.length} messages the model reads)`,
			"",
			"| Who | Message |",
			"| - | - |",
			...seen.map((message) => `| ${who(message)} | ${cell(message.text)} |`),
			"",
			`**Draft** · \`${call.model}\` · ${callMeta(call)}`,
			"",
		);
		if (check?.draft) {
			lines.push(
				`| Reply (${guestLanguage}) | Office reply (${languageName(thread.input.officeLanguage)}) |`,
				"| - | - |",
				`| ${cell(check.draft.reply)} | ${cell(check.draft.officeReply)} |`,
				"",
			);
		} else if (call.text) {
			lines.push("Not the JSON shape. The model answered:", "", "```text", call.text, "```", "");
		} else if (call.outcome === "not called") {
			lines.push("_Not called (dry run)._", "");
		} else {
			lines.push("_No answer._", "");
		}
		if (check) {
			lines.push(
				`**Checks:** ${verdictsLine(check.verdicts)}`,
				"",
				`**App post-check:** ${row.appPasses ? "passes: the app shows this draft" : "blocks it: the app shows the template"}`,
				"",
			);
		}
		lines.push(
			"<details><summary>The prompt the model reads</summary>",
			"",
			"```text",
			row.userPrompt,
			"```",
			"",
			"</details>",
			"",
		);
	});
	return lines.join("\n");
}

// The translation eval

export type TranslationRow = { pair: TranslationPair; calls: CallResult[] };

export function translationReport(input: {
	rows: TranslationRow[];
	mode: Mode;
	date: string;
	models: string[];
	systemPrompts: Record<string, string>;
}): string {
	const { rows, mode, models } = input;
	const messages = new Set(rows.map((row) => row.pair.text)).size;
	const lines = [
		...header("Translation eval", mode, input.date, [
			`Models: ${models.map((model) => `\`${model}\``).join(" vs ")} (Gemini 3.x thinks at its lowest level, \`reasoning.effort: minimal\`)`,
			`${rows.length} pairs: the seed's ${messages} guest messages in Vietnamese, Japanese, Korean and Russian, into English and Vietnamese (never into their own language)`,
			"The seed reference is the seed's hand-written translation, for comparison; no model wrote it.",
		]),
		"## Summary",
		"",
		"| Model | Calls | Tokens in / out | Cost | Median latency | Slowest |",
		"| - | - | - | - | - | - |",
		...models.map((model) => {
			const calls = rows.flatMap((row) => row.calls.filter((call) => call.model === model));
			const sum = totals(calls);
			const est = mode === "dry-run" ? "est. " : "";
			const answered = mode === "dry-run" ? `${sum.calls}` : `${sum.ok} of ${sum.calls} answered`;
			const slowest = sum.latencies.length ? Math.max(...sum.latencies) : null;
			return `| \`${model}\` | ${answered} | ${est}${sum.input} / ${sum.output} | ${est}${formatUsd(sum.cost)} | ${seconds(median(sum.latencies))} | ${seconds(slowest)} |`;
		}),
		"",
		"<details><summary>The system prompt (into English)</summary>",
		"",
		"```text",
		input.systemPrompts.en ?? "",
		"```",
		"",
		"</details>",
		"",
		"## Pairs",
		"",
	];
	rows.forEach((row, index) => {
		const { pair } = row;
		lines.push(
			`### ${index + 1}. ${pair.guestName ?? "No name"} (${pair.office}) · ${languageName(pair.from)} → ${languageName(pair.to)}`,
			"",
			"| | Text | Tokens, latency, cost |",
			"| - | - | - |",
			`| Original | ${cell(pair.text)} | |`,
			`| Seed reference | ${pair.reference ? cell(pair.reference) : "_none_"} | |`,
			...row.calls.map((call) => {
				const text = call.text ?? (call.outcome === "not called" ? "_not called_" : "_no answer_");
				return `| \`${call.model}\` | ${cell(text)} | ${callMeta(call)} |`;
			}),
			"",
		);
	});
	return lines.join("\n");
}
