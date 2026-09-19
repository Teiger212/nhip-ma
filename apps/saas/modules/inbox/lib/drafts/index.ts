import type { InboxConfig } from "../config";
import { type DraftAdapter, noDraftAdapter } from "./adapter";
import { createOpenAiCompatibleDraftAdapter } from "./openai-compatible";

/**
 * The mock | model seam for drafting. No key means no model: templates and no translation.
 * `validateInboxEnv` guarantees a key comes with a model id, so the fallback here is only
 * for scripts that skipped validation.
 */
export function draftAdapterFromConfig(config: InboxConfig): DraftAdapter {
	if (config.drafts.apiKey && config.drafts.model) {
		return createOpenAiCompatibleDraftAdapter({
			apiKey: config.drafts.apiKey,
			baseUrl: config.drafts.baseUrl,
			model: config.drafts.model,
		});
	}
	return noDraftAdapter;
}

export {
	noDraftAdapter,
	type DraftAdapter,
	type FollowUpInput,
	type TranslateInput,
} from "./adapter";
