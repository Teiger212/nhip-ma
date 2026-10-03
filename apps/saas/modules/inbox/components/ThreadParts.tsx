"use client";

import { Badge, cn } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { guestInitials } from "../lib/guest-initials";
import { useOfficeRole } from "../lib/inbox-queries";
import { threadStatus } from "../lib/queue";
import type { ConversationSummary, OperatorLanguage } from "../lib/types";

/** SaaS routing only serves the operator locales (`modules/i18n/routing.ts`). */
export function useOperatorLanguage(): OperatorLanguage {
	return useLocale() as OperatorLanguage;
}

/** The guest's initials; solid blue on the selected thread, which is how selection shows. */
export function GuestMark({ name, selected = false }: { name: string; selected?: boolean }) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-8 font-semibold tracking-tight text-micro flex shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none",
				selected ? "bg-primary text-primary-foreground" : "bg-touch/12 text-touch",
			)}
		>
			{guestInitials(name)}
		</span>
	);
}

/**
 * The Badge tone of each thread status. Only the turn gets color (DESIGN.md, The Turn Is The
 * Signal Rule); the CRM's Won and Lost are neutral: an outcome is not a turn, and Lost is
 * not an error.
 */
const STATUS_BADGE = {
	yourTurn: "warning",
	sent: "success",
	won: "neutral",
	lost: "neutral",
} as const satisfies Record<ReturnType<typeof threadStatus>, "neutral" | "success" | "warning">;

/**
 * The pipe, who holds the thread (the pool, you, or another agent, ADR 0015) and the status
 * (Your turn / Sent, or the CRM's Won / Lost while resolved, ADR 0003), on a row and on the
 * thread header alike.
 */
export function ThreadFlags({
	conversation,
}: {
	conversation: Pick<
		ConversationSummary,
		"pipe" | "owner" | "unansweredInboundId" | "crm" | "lastGuestInboundAt"
	>;
}) {
	const t = useTranslations("inbox");
	const status = threadStatus(conversation);
	const { userId } = useOfficeRole();
	const owner = conversation.owner;
	return (
		<>
			<Badge status="neutral">{t(`pipes.${conversation.pipe}`)}</Badge>
			<Badge
				status="neutral"
				data-test="thread-owner"
				data-owner={!owner ? "pool" : owner.id === userId ? "mine" : "other"}
			>
				{!owner ? t("owner.pool") : owner.id === userId ? t("owner.mine") : owner.name}
			</Badge>
			<Badge status={STATUS_BADGE[status]} data-test="thread-status" data-status={status}>
				{status === "won" || status === "lost" ? t(`crm.${status}`) : t(status)}
			</Badge>
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
