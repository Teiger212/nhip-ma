import enSaas from "../../../../../packages/i18n/translations/en/saas.json";
import viSaas from "../../../../../packages/i18n/translations/vi/saas.json";
import type { CribTranslate } from "./crib";

/** Minimal `t()` over the real `inbox.*` catalog for tests that render operator copy. */
export function translateInbox(messages: Record<string, unknown>): CribTranslate {
	return (key, values = {}) => {
		const raw = key.split(".").reduce<unknown>((acc, part) => {
			if (!acc || typeof acc !== "object") {
				return undefined;
			}
			return (acc as Record<string, unknown>)[part];
		}, messages);
		if (typeof raw !== "string") {
			throw new Error(`Missing inbox key ${key}`);
		}
		return raw.replace(/\{(\w+)\}/g, (_, name: string) => values[name] ?? "");
	};
}

export const inboxEn = translateInbox(enSaas.inbox);
export const inboxVi = translateInbox(viSaas.inbox);
