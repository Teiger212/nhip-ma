import { PIPE_NAMES } from "../pipe-names";
import type { GuestLanguage, Pipe } from "../types";

export type AlertLocale = "en" | "vi";

/** `t()` over the `inbox` messages of the operator's locale. */
export type AlertTranslate = (key: string, values?: Record<string, string>) => string;

/** The operator's language (`user.locale`), Vietnamese when none is set (ADR 0019). */
export function alertLocale(locale: string | null): AlertLocale {
	return locale === "en" ? "en" : "vi";
}

/**
 * Where an alert opens: the Inbox in the operator's locale, carrying only the alert's own
 * opaque id (ADR 0019), which the server resolves for that operator alone (#136).
 */
export function alertLink(locale: AlertLocale, alertId: string): string {
	return `/${locale}/inbox?alert=${encodeURIComponent(alertId)}`;
}

/**
 * What a guest's alert says, in the operator's language: "Minji is waiting", "Zalo · Korean".
 * A guest with no name is "A guest", never their Zalo id or phone, so this does not reuse the
 * Inbox's `displayName`. No message text. Before the one-shot has detected the language, the
 * body is the pipe alone.
 */
export function guestAlertContent(
	guest: { guestName: string | null; pipe: Pipe; guestLanguage: GuestLanguage | null },
	t: AlertTranslate,
): { title: string; body: string } {
	const name = guest.guestName?.trim();
	const title = name ? t("alerts.waiting", { name }) : t("alerts.waitingUnnamed");
	const pipe = PIPE_NAMES[guest.pipe];
	const body = guest.guestLanguage
		? t("alerts.body", { pipe, language: t(`guestLanguage.${guest.guestLanguage}`) })
		: pipe;
	return { title, body };
}
