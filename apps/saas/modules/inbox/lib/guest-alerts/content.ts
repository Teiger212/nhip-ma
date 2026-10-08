import { languageName } from "../language-name";
import { PIPE_NAMES } from "../pipe-names";
import type { Pipe } from "../types";

/** The office language (ADR 0025): every alert of the office is written in it. */
export type AlertLocale = "en" | "vi";

/** `t()` over the `inbox` messages of the office language. */
export type AlertTranslate = (key: string, values?: Record<string, string>) => string;

/**
 * Where an alert opens: the Inbox in the office language, carrying only the alert's own
 * opaque id (ADR 0019), which the server resolves for that operator alone (#136).
 */
export function alertLink(locale: AlertLocale, alertId: string): string {
	return `/${locale}/inbox?alert=${encodeURIComponent(alertId)}`;
}

/**
 * What a guest's alert says, in the office language: "Minji is waiting", "Zalo · Korean".
 * A guest with no name is "A guest", never their Zalo id or phone, so this does not reuse the
 * Inbox's `displayName`. No message text. Before the one-shot has detected the language, the
 * body is the pipe alone.
 */
export function guestAlertContent(
	guest: { guestName: string | null; pipe: Pipe; guestLanguage: string | null },
	t: AlertTranslate,
	locale = "en",
): { title: string; body: string } {
	const name = guest.guestName?.trim();
	const title = name ? t("alerts.waiting", { name }) : t("alerts.waitingUnnamed");
	const pipe = PIPE_NAMES[guest.pipe];
	// The guest language, named whatever it is (#245): "Zalo · French".
	const body = guest.guestLanguage
		? t("alerts.body", {
				pipe,
				language: languageName(guest.guestLanguage, locale, (language) =>
					t(`guestLanguage.${language}`),
				),
			})
		: pipe;
	return { title, body };
}
