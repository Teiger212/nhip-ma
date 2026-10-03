"use client";

import { cn } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { guestInitials } from "../lib/guest-initials";
import { useOfficeRole } from "../lib/inbox-queries";
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
			className="size-8 font-semibold tracking-tight text-micro flex shrink-0 items-center justify-center rounded-md bg-touch/12 text-touch"
		>
			{guestInitials(name)}
		</span>
	);
}

function CompactFlag({
	children,
	tone,
	testId,
	dataOwner,
}: {
	children: ReactNode;
	tone: "neutral" | "warning" | "success";
	testId?: string;
	dataOwner?: string;
}) {
	return (
		<span
			data-test={testId}
			data-owner={dataOwner}
			className={cn(
				"h-5 px-2 font-medium text-micro inline-flex items-center rounded-md leading-none",
				tone === "neutral" && "bg-muted text-muted-foreground",
				tone === "warning" && "bg-warning/12 text-warning",
				tone === "success" && "bg-success/12 text-success",
			)}
		>
			{children}
		</span>
	);
}

/**
 * The pipe, who holds the thread (the pool, you, or another agent, ADR 0015) and the turn
 * (Your turn / Sent), on a row and on the thread header alike.
 */
export function ThreadFlags({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const turn = yourTurn(conversation);
	const { userId } = useOfficeRole();
	const owner = conversation.owner;
	return (
		<>
			<CompactFlag tone="neutral">{t(`pipes.${conversation.pipe}`)}</CompactFlag>
			<CompactFlag
				tone="neutral"
				testId="thread-owner"
				dataOwner={!owner ? "pool" : owner.id === userId ? "mine" : "other"}
			>
				{!owner ? t("owner.pool") : owner.id === userId ? t("owner.mine") : owner.name}
			</CompactFlag>
			<CompactFlag tone={turn ? "warning" : "success"}>
				{turn ? t("yourTurn") : t("sent")}
			</CompactFlag>
		</>
	);
}

/** A centred sentence for a column with nothing to show, with an optional action under it. */
export function ThreadListState({
	title,
	action,
	testId,
}: {
	title: string;
	action?: ReactNode;
	/** For E2E: which state this is, independent of its wording. */
	testId?: string;
}) {
	return (
		<div
			className="px-4 py-10 flex flex-col items-center justify-center text-center"
			data-test={testId}
		>
			<p className="text-sm max-w-empty-note text-pretty text-muted-foreground">{title}</p>
			{action}
		</div>
	);
}
