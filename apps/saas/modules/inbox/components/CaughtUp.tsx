"use client";

import { Button, cn } from "@repo/ui";
import { useHydrated } from "@shared/hooks/use-hydrated";
import { useLocale, useTranslations } from "next-intl";

import { guestLabel } from "../lib/display-name";
import { formatClockTime } from "../lib/time";
import type { ConversationSummary } from "../lib/types";

/**
 * The open card once nothing waits (#330, delight 1): the queue is done, said where the agent is
 * looking. A Pebble Strong mark with the Sent Green check, the list's own words, and the last
 * reply that went out as proof it did. On a phone, "View sent" is the way back to the list. The
 * mark rises and its check strokes in only when the agent's own send emptied the queue
 * (`celebrate`); arriving at an Inbox already empty shows it still. Reduced motion cross-fades.
 */
export function CaughtUp({
	title,
	body,
	lastSent,
	celebrate,
	onViewSent,
}: {
	title: string;
	body?: string;
	/** The thread with the latest reply sent, if any. */
	lastSent: ConversationSummary | null;
	celebrate: boolean;
	/** A phone only: back to the list, on Sent. */
	onViewSent?: () => void;
}) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const hydrated = useHydrated();
	const words = celebrate ? "animate-caught-words motion-reduce:animate-fade-in" : undefined;
	return (
		<div
			data-test="caught-up"
			className="gap-1.5 px-8 py-8 flex flex-1 flex-col items-center justify-center text-center"
		>
			<span
				aria-hidden="true"
				className={cn(
					"mb-2 size-11 grid place-items-center rounded-lg bg-muted-strong",
					celebrate && "animate-caught-mark motion-reduce:animate-fade-in",
				)}
			>
				<svg
					viewBox="0 0 24 24"
					fill="none"
					className="size-5.5 stroke-success"
					strokeWidth={2.5}
					strokeLinecap="round"
					strokeLinejoin="round"
				>
					<path
						d="M20 6 9 17l-5-5"
						className={cn(
							"stroke-draw",
							celebrate && "animate-caught-check motion-reduce:animate-none",
						)}
					/>
				</svg>
			</span>
			<p className={cn("text-title font-extrabold", words)}>{title}</p>
			{body ? (
				<p className={cn("text-sm max-w-caught-note text-balance text-muted-foreground", words)}>
					{body}
				</p>
			) : null}
			{lastSent?.sentAt && hydrated ? (
				<p
					data-test="caught-up-last-sent"
					className={cn("mt-2 text-xs max-w-full wrap-break-word text-muted-foreground", words)}
				>
					{t.rich("lastSentTo", {
						name: guestLabel(lastSent).text,
						time: formatClockTime(lastSent.sentAt, locale),
						guest: (chunks) => <b className="font-bold text-foreground">{chunks}</b>,
					})}
				</p>
			) : null}
			{onViewSent ? (
				<div className={cn("mt-3 md:hidden", words)}>
					<Button type="button" variant="outline" className="min-h-11" onClick={onViewSent}>
						{t("viewSent")}
					</Button>
				</div>
			) : null}
		</div>
	);
}
