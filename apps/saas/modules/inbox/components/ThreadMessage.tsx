"use client";

import { Badge, cn } from "@repo/ui";
import { useHydrated } from "@shared/hooks/use-hydrated";
import { useTranslations } from "next-intl";

import { useOfficeLanguage } from "../lib/inbox-queries";
import { isSupportedLanguage, languageName } from "../lib/language-name";
import { messageLine } from "../lib/office-line";
import { formatInboxTimestamp } from "../lib/time";
import type { GuestLanguage, Message } from "../lib/types";
import { OfficeLine } from "./OfficeLine";
import { useOperatorLanguage } from "./ThreadParts";

/** Who sent one of the office's messages, as a person reads it (the stored values are internal). */
const SOURCE_KEYS = {
	guest: "guest",
	nhip: "nhip",
	"oa-echo": "oaEcho",
	"auto-reply": "autoReply",
} as const;

/**
 * One message on the thread as a chat bubble (#248): the guest's on the left, with its
 * translation as a muted second block inside the bubble; the office's on the right, with its
 * operator line (#242) as the same muted block. Under the bubble, on its side: where an office
 * message came from, the demo-send badge, and the time.
 */
export function ThreadMessage({
	message,
	guestLanguage = null,
	replyLanguage = null,
}: {
	message: Message;
	/** The thread's guest language, named (#245); null before the one-shot has run. */
	guestLanguage?: string | null;
	/** The language the office writes to the guest in; null before the one-shot has run. */
	replyLanguage?: GuestLanguage | null;
}) {
	const t = useTranslations("inbox");
	const locale = useOperatorLanguage();
	const hydrated = useHydrated();
	const officeLanguage = useOfficeLanguage().data;
	const inbound = message.direction === "in";
	// In the office language, whatever the reader's interface (ADR 0025). Rendered as text, never
	// as markup (ADR 0007): a React text node cannot carry HTML.
	const translation =
		inbound && officeLanguage ? message.translations?.[officeLanguage] : undefined;
	// Until that one lands (the day's cap spent after a language change, or still on its way), the
	// one kept from before the change shows, labelled with its language, with no model call
	// (decided by Eyal, 2026-10-08). Never for a thread whose guest writes in the office language.
	const keptLanguage = officeLanguage === "en" ? "vi" : "en";
	const kept =
		inbound && officeLanguage && !translation && guestLanguage && guestLanguage !== officeLanguage
			? message.translations?.[keptLanguage]
			: undefined;
	// A guest language Nhịp doesn't support gets no translation; a note says so in its place (#245).
	const untranslated =
		inbound && !translation && guestLanguage && !isSupportedLanguage(guestLanguage)
			? languageName(guestLanguage, locale, (language) => t(`guestLanguage.${language}`))
			: null;
	const officeLine = messageLine(message, officeLanguage, replyLanguage);
	return (
		<div className={cn("gap-1 min-w-0 flex flex-col", inbound ? "items-start" : "items-end")}>
			<div
				data-test="message"
				className={cn(
					"px-3.5 py-2.5 text-sm max-w-xl min-w-0 rounded-xl break-words",
					inbound ? "shadow-hairline bg-card" : "bg-muted",
				)}
			>
				<p className="leading-relaxed whitespace-pre-wrap">{message.text}</p>
				{translation ? (
					<p className="mt-2 pt-2 text-xs leading-relaxed border-t whitespace-pre-wrap text-muted-foreground">
						<span className="sr-only">{t("translation")}: </span>
						{translation}
					</p>
				) : kept ? (
					<p
						data-test="kept-translation"
						className="mt-2 pt-2 text-xs leading-relaxed border-t whitespace-pre-wrap text-muted-foreground"
					>
						<span className="font-medium block">
							{t("translationIn", { language: t(`guestLanguage.${keptLanguage}`) })}
						</span>
						{kept}
					</p>
				) : untranslated ? (
					<p className="mt-2 pt-2 text-xs leading-relaxed border-t text-muted-foreground">
						{t("noTranslation", { language: untranslated })}
					</p>
				) : officeLine ? (
					<OfficeLine line={officeLine} className="mt-2 pt-2 border-t" />
				) : null}
			</div>
			<div className="gap-x-2 gap-y-1 px-1 text-xs flex flex-wrap items-center text-muted-foreground">
				{inbound ? null : message.source === "auto-reply" ? (
					<>
						{/* The office's greeting, sent on its own (ADR 0021, DESIGN.md: inline badges). */}
						<Badge
							status="neutral"
							size="sm"
							data-test="message-source"
							data-writer={message.writtenBy ?? undefined}
						>
							{t("source.autoReply")}
						</Badge>
					</>
				) : (
					<span className="font-medium text-foreground/80" data-test="message-source">
						{t(`source.${SOURCE_KEYS[message.source]}`)}
					</span>
				)}
				{message.mock ? (
					<Badge status="info" size="sm">
						{t("mock")}
					</Badge>
				) : null}
				<time className="tabular-nums" dateTime={message.at}>
					{hydrated ? formatInboxTimestamp(message.at, locale) : null}
				</time>
			</div>
		</div>
	);
}
