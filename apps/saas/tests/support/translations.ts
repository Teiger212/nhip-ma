import { askState } from "./state-client";

/** The office's daily translation cap: `.env.e2e` sets no `TRANSLATE_DAILY_CAP`, so the default. */
export const TRANSLATE_DAILY_CAP = 1000;

/**
 * Setup (see translation-state.ts): the office has made this many translations today. At the cap
 * a translation is declined with no model call; back under it, the next one is made.
 */
export async function setTranslationsToday(officeId: string, calls: number): Promise<void> {
	await askState("translations.today", officeId, String(calls));
}
