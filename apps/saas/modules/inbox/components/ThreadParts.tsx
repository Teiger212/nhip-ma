"use client";

import { cn } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { guestInitials } from "../lib/guest-initials";
import { yourTurn } from "../lib/queue";
import type { Conversation, OperatorLanguage } from "../lib/types";

/** SaaS routing only serves the operator locales (`modules/i18n/routing.ts`). */
export function useOperatorLanguage(): OperatorLanguage {
	return useLocale() as OperatorLanguage;
}

export function GuestMark({ name }: { name: string }) {
	return (
		<span
			aria-hidden="true"
			className="size-8 font-semibold tracking-tight flex shrink-0 items-center justify-center rounded-full rounded-md bg-primary bg-touch/12 text-[0.7rem] text-primary-foreground text-touch"
		>
			{guestInitials(name)}
		</span>
	);
}

function CompactFlag({
	children,
	tone,
}: {
	children: ReactNode;
	tone: "neutral" | "warning" | "success";
}) {
	return (
		<span
			className={cn(
				"h-5 px-1.5 font-medium px-2 inline-flex items-center rounded-full rounded-md text-[11px] leading-none",
				tone === "neutral" && "bg-muted text-muted-foreground",
				tone === "warning" && "bg-warning/12 text-warning",
				tone === "success" && "bg-success/12 text-success",
			)}
		>
			{children}
		</span>
	);
}

/** The pipe and the turn (Your turn / Sent), on a row and on the thread header alike. */
export function ThreadFlags({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const turn = yourTurn(conversation);
	return (
		<>
			<CompactFlag tone="neutral">{t(`pipes.${conversation.pipe}`)}</CompactFlag>
			<CompactFlag tone={turn ? "warning" : "success"}>
				{turn ? t("yourTurn") : t("sent")}
			</CompactFlag>
		</>
	);
}

/** A centred sentence for a column with nothing to show, with an optional action under it. */
export function ThreadListState({ title, action }: { title: string; action?: ReactNode }) {
	return (
		<div className="px-4 py-10 flex flex-col items-center justify-center text-center">
			<p className="text-sm max-w-[22ch] text-pretty text-muted-foreground">{title}</p>
			{action}
		</div>
	);
}
