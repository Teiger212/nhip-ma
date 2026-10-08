import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * The i18n check that replaces Vietnamese copies of English E2E scenarios (AGENTS.md, lean
 * testing; #278): every English key has a Vietnamese value, and a Vietnamese value the same as
 * the English one is a missed translation unless it is a word both languages write alike.
 * Marketing's Vietnamese is not translated yet, so it is left out.
 */
const TRANSLATIONS = path.resolve(import.meta.dirname, "../../../../../packages/i18n/translations");
const NAMESPACES = ["saas", "shared", "mail"] as const;

/** Values Vietnamese writes as English does: names, codes and placeholders-only strings. */
const SAME_IN_BOTH = new Set([
	"saas:admin.connections.crm.label",
	"saas:admin.connections.crm.hubspot",
	"saas:app.menu.navigationTitle",
	"saas:app.menu.crm",
	"saas:auth.forgotPassword.email",
	"saas:auth.signup.email",
	"saas:notFound.code",
	"saas:organizations.settings.members.inviteMember.email",
	"saas:settings.account.nameGuestsSee.placeholder",
	"saas:home.p90",
	"saas:inbox.brand",
	"saas:inbox.pipes.zalo",
	"saas:inbox.pipes.whatsapp",
	"saas:inbox.alerts.body",
	"saas:inbox.details.crm",
	"saas:inbox.managerCount.line",
	"shared:pricing.products.pro.title",
]);

type Messages = { [key: string]: string | Messages };

function load(locale: "en" | "vi", namespace: string): Messages {
	return JSON.parse(fs.readFileSync(path.join(TRANSLATIONS, locale, `${namespace}.json`), "utf8"));
}

/** Every leaf as `namespace:dotted.key` → its string. */
function flatten(messages: Messages, namespace: string, prefix = ""): Map<string, string> {
	const leaves = new Map<string, string>();
	for (const [key, value] of Object.entries(messages)) {
		const dotted = prefix ? `${prefix}.${key}` : key;
		if (typeof value === "string") {
			leaves.set(`${namespace}:${dotted}`, value);
		} else {
			for (const [leaf, text] of flatten(value, namespace, dotted)) {
				leaves.set(leaf, text);
			}
		}
	}
	return leaves;
}

const en = new Map<string, string>();
const vi = new Map<string, string>();
for (const namespace of NAMESPACES) {
	for (const [key, value] of flatten(load("en", namespace), namespace)) {
		en.set(key, value);
	}
	for (const [key, value] of flatten(load("vi", namespace), namespace)) {
		vi.set(key, value);
	}
}

describe("translation keys (saas, shared, mail)", () => {
	it("every English key has a Vietnamese value", () => {
		const missing = [...en.keys()].filter((key) => !vi.get(key)?.trim());
		expect(missing).toEqual([]);
	});

	it("Vietnamese has no key English lacks", () => {
		expect([...vi.keys()].filter((key) => !en.has(key))).toEqual([]);
	});

	it("a Vietnamese value the same as the English one is on the allowlist", () => {
		const same = [...en]
			.filter(([key, text]) => text.trim() && vi.get(key) === text)
			.map(([key]) => key);
		expect(same.filter((key) => !SAME_IN_BOTH.has(key))).toEqual([]);
	});

	it("the allowlist names only keys that are still the same in both", () => {
		expect([...SAME_IN_BOTH].filter((key) => !en.has(key) || en.get(key) !== vi.get(key))).toEqual(
			[],
		);
	});
});
