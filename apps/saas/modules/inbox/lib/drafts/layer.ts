import { OFFICE_TIME_ZONE } from "@home/lib/window";
import { errorKind } from "@shared/lib/scrub";

import type { DraftAdapter, DraftInput, ModelTask, TranslateInput } from "./adapter";

/**
 * What came of one model call. Only `ok` carries text; every other outcome leaves the fallback
 * standing. A timeout, and an error the provider may get past (`mayPassOnRetry`), are retried
 * once (ADR 0024); `filtered` (the provider's content filter) and `empty` are answers, not
 * failures, and are not.
 */
export type Attempt =
	| { outcome: "ok"; text: string; inputTokens: number | null; outputTokens: number | null }
	| {
			outcome: "filtered" | "empty";
			inputTokens: number | null;
			outputTokens: number | null;
	  }
	| { outcome: "error"; status?: number; kind?: string };

/** What answers one task: OpenRouter with the task's model, or the E2E stub. */
export type TaskBackend<Input> = {
	/** The model id, as the request sends it and the log line names it. */
	model: string;
	/** One call. It stops when `signal` aborts (the 20 s timeout). */
	run(input: Input, signal: AbortSignal): Promise<Attempt>;
};

export type TaskBackends = {
	draft?: TaskBackend<DraftInput>;
	translate?: TaskBackend<TranslateInput>;
};

/** Counts one call against the office's cap for the day; false once the cap is reached. */
export type ClaimModelCall = (call: {
	officeId: string;
	task: ModelTask;
	day: string;
	cap: number;
}) => Promise<boolean>;

/** A call that has not answered in 20 s is given up and tried once more (ADR 0024). */
export const MODEL_TIMEOUT_MS = 20_000;
/** The first call and one retry. */
const MAX_ATTEMPTS = 2;

/**
 * Whether a failed call is worth its retry: no answer at all (the network), a timeout, or the
 * provider busy or down (408, 429, 5xx). A refusal such as a bad key, an unknown model or an
 * empty balance would fail again and only spend another of the office's calls.
 */
function mayPassOnRetry(status: number | undefined): boolean {
	return status === undefined || status === 408 || status === 429 || status >= 500;
}

/** One line per model call (ADR 0024): never message text, never a thread or guest id. */
export type ModelCallLog = {
	task: ModelTask;
	model: string;
	officeId: string;
	inputTokens: number | null;
	outputTokens: number | null;
	latencyMs: number;
	outcome: "ok" | "filtered" | "empty" | "timeout" | "error" | "capped";
	/** The HTTP status of a refused call. */
	status?: number;
	/** An error's kind (#220), never its message. */
	kind?: string;
};

function logCall(line: ModelCallLog): void {
	if (line.outcome === "ok") {
		console.info("model call", line);
	} else {
		console.warn("model call", line);
	}
}

/** The office's calendar day at `now`, midnight to midnight in Asia/Ho_Chi_Minh: `YYYY-MM-DD`. */
export function officeDay(now: Date): string {
	return new Intl.DateTimeFormat("en-CA", {
		timeZone: OFFICE_TIME_ZONE,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).format(now);
}

/**
 * The model layer: each task's backend behind the office's daily cap, a 20 s timeout with one
 * retry, and a log line per call. A task with no backend is off: it returns null at once, counts
 * nothing and logs nothing.
 */
export function createModelLayer(deps: {
	backends: TaskBackends;
	caps: Record<ModelTask, number>;
	claim: ClaimModelCall;
	now?: () => Date;
	timeoutMs?: number;
}): DraftAdapter {
	const now = deps.now ?? (() => new Date());
	const timeoutMs = deps.timeoutMs ?? MODEL_TIMEOUT_MS;

	/** One call, given up after the timeout whether or not the backend heeds its signal. */
	async function attempt<Input>(
		backend: TaskBackend<Input>,
		input: Input,
	): Promise<Attempt | { outcome: "timeout" }> {
		const controller = new AbortController();
		let timer: ReturnType<typeof setTimeout> | undefined;
		const timedOut = new Promise<{ outcome: "timeout" }>((resolve) => {
			timer = setTimeout(() => {
				controller.abort();
				resolve({ outcome: "timeout" });
			}, timeoutMs);
		});
		try {
			return await Promise.race([backend.run(input, controller.signal), timedOut]);
		} catch (error) {
			return controller.signal.aborted
				? { outcome: "timeout" }
				: { outcome: "error", kind: errorKind(error) };
		} finally {
			clearTimeout(timer);
		}
	}

	async function call<Input extends { officeId: string }>(
		task: ModelTask,
		backend: TaskBackend<Input> | undefined,
		input: Input,
	): Promise<string | null> {
		if (!backend) return null;
		const base = { task, model: backend.model, officeId: input.officeId };
		for (let tries = 0; tries < MAX_ATTEMPTS; tries += 1) {
			// A retry is a call, so it counts too.
			let allowed: boolean;
			try {
				allowed = await deps.claim({
					officeId: input.officeId,
					task,
					day: officeDay(now()),
					cap: deps.caps[task],
				});
			} catch (error) {
				// The count can't be read: no call, the fallback stands.
				logCall({
					...base,
					inputTokens: null,
					outputTokens: null,
					latencyMs: 0,
					outcome: "error",
					kind: errorKind(error),
				});
				return null;
			}
			if (!allowed) {
				logCall({
					...base,
					inputTokens: null,
					outputTokens: null,
					latencyMs: 0,
					outcome: "capped",
				});
				return null;
			}
			// The model's latency: from the request, not counting the claim.
			const sentAt = now().getTime();
			const result = await attempt(backend, input);
			const latencyMs = now().getTime() - sentAt;
			if (result.outcome === "timeout" || result.outcome === "error") {
				const detail =
					result.outcome === "error"
						? {
								...(result.status === undefined ? {} : { status: result.status }),
								...(result.kind === undefined ? {} : { kind: result.kind }),
							}
						: {};
				logCall({
					...base,
					inputTokens: null,
					outputTokens: null,
					latencyMs,
					outcome: result.outcome,
					...detail,
				});
				if (result.outcome === "timeout" || mayPassOnRetry(result.status)) continue;
				return null;
			}
			logCall({
				...base,
				inputTokens: result.inputTokens,
				outputTokens: result.outputTokens,
				latencyMs,
				outcome: result.outcome,
			});
			return result.outcome === "ok" ? result.text : null;
		}
		return null;
	}

	return {
		serves: (task) => Boolean(deps.backends[task]),
		translate: (input) => call("translate", deps.backends.translate, input),
		draft: (input) => call("draft", deps.backends.draft, input),
	};
}
