import { DEMO_SEED_OFFICE } from "../lib/dev-seed/demo-office";
import { RIVER_SEED_OFFICE } from "../lib/dev-seed/river-office";
import { detectLanguage } from "../lib/language";
import type { GuestLanguage, OperatorLanguage } from "../lib/types";

/**
 * The translation eval's pairs (#254, ADR 0024 "Models"): every guest message in the seed (both
 * offices, the walk's four demo threads included) in Vietnamese, Japanese, Korean or Russian,
 * into each office language, English and Vietnamese, but its own. A message is read as the app
 * reads it: `from` as `scheduleTranslation` sends it. French and Chinese read as English there,
 * and a language Nhịp doesn't support is never translated (#245), so they aren't pairs.
 */

export type TranslationPair = {
	id: string;
	office: string;
	guestName: string | null;
	text: string;
	from: GuestLanguage;
	to: OperatorLanguage;
	/** The seed's own translation, written by hand: a reference, not a model's. */
	reference: string | null;
};

const SOURCES: readonly GuestLanguage[] = ["vi", "ja", "ko", "ru"];
const TARGETS: readonly OperatorLanguage[] = ["en", "vi"];

export function translationPairs(): TranslationPair[] {
	const pairs: TranslationPair[] = [];
	for (const office of [DEMO_SEED_OFFICE, RIVER_SEED_OFFICE]) {
		for (const guest of office.guests) {
			guest.story.forEach((step, index) => {
				if (step.kind !== "writes") return;
				const from = detectLanguage(step.text);
				if (!SOURCES.includes(from)) return;
				for (const to of TARGETS) {
					if (to === from) continue;
					pairs.push({
						id: `${guest.guestId}-${index}-${to}`,
						office: office.officeId,
						guestName: guest.name,
						text: step.text,
						from,
						to,
						reference: step.translations[to] ?? null,
					});
				}
			});
		}
	}
	return pairs;
}
