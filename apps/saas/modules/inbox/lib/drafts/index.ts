import type { InboxConfig } from "../config";
import { type DraftAdapter, type ModelTask, noDraftAdapter } from "./adapter";
import { type ClaimModelCall, createModelLayer, type TaskBackends } from "./layer";
import { createOpenRouterBackends } from "./openrouter";
import { stubBackends } from "./stub";

/**
 * The model layer from config (ADR 0024). Each task is answered by the stub where `MODEL_STUB`
 * names it (E2E), else by OpenRouter with the task's model where there is a key, else by
 * nothing: no translation, and every suggested reply is a template.
 */
export function draftAdapterFromConfig(
	config: InboxConfig,
	deps: { claim: ClaimModelCall; now?: () => Date; timeoutMs?: number },
): DraftAdapter {
	const { models } = config;
	const openRouter = models.apiKey
		? createOpenRouterBackends({
				apiKey: models.apiKey,
				baseUrl: models.baseUrl,
				models: { draft: models.draft.model, translate: models.translate.model },
			})
		: null;
	const backendFor = <T extends ModelTask>(task: T): TaskBackends[T] =>
		models.stub.includes(task) ? stubBackends[task] : (openRouter?.[task] ?? undefined);
	const backends: TaskBackends = { draft: backendFor("draft"), translate: backendFor("translate") };
	if (!backends.draft && !backends.translate) {
		return noDraftAdapter;
	}
	return createModelLayer({
		backends,
		caps: { draft: models.draft.dailyCap, translate: models.translate.dailyCap },
		claim: deps.claim,
		now: deps.now,
		timeoutMs: deps.timeoutMs,
	});
}

export {
	CAPPED,
	type Capped,
	DRAFT_MESSAGES,
	noDraftAdapter,
	type DraftAdapter,
	type DraftInput,
	type ModelTask,
	type TranslateInput,
} from "./adapter";
