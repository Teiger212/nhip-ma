"use client";

import { Badge, cn } from "@repo/ui";
import { PhoneIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { isDecided } from "../lib/crm/rules";
import { guestInitials } from "../lib/guest-initials";
import { useOfficeRole } from "../lib/inbox-queries";
import { type ThreadStatus, threadStatus } from "../lib/queue";
import type { ConversationSummary, OperatorLanguage } from "../lib/types";

/** SaaS routing only serves the operator locales (`modules/i18n/routing.ts`). */
export function useOperatorLanguage(): OperatorLanguage {
	return useLocale() as OperatorLanguage;
}

/**
 * The guest's initials; solid blue on the selected thread, which is how selection shows. A guest
 * known only by their WhatsApp number gets a phone glyph instead of the number's first digit
 * (`guestLabel`, #94).
 */
export function GuestMark({
	name,
	phone = false,
	selected = false,
}: {
	name: string;
	phone?: boolean;
	selected?: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-8 font-semibold tracking-tight text-micro flex shrink-0 items-center justify-center rounded-md transition-colors duration-200 motion-reduce:transition-none",
				selected ? "bg-primary text-primary-foreground" : "bg-touch/12 text-touch",
			)}
		>
			{phone ? <PhoneIcon className="size-3.5" strokeWidth={1.75} /> : guestInitials(name)}
		</span>
	);
}

/**
 * The Badge tone of each thread status. Only the turn gets color (DESIGN.md, The Turn Is The
 * Signal Rule); the CRM's Won and Lost are neutral: an outcome is not a turn, and Lost is not
 * an error.
 */
const STATUS_BADGE = {
	yourTurn: "warning",
	waiting: "warning",
	sent: "success",
	won: "neutral",
	lost: "neutral",
} as const satisfies Record<ThreadStatus | "waiting", "neutral" | "success" | "warning">;

/**
 * The pipe, who holds the thread (Unassigned, you, or another operator, ADR 0022) and the status
 * (Your turn / Sent, or the CRM's Won / Lost while resolved, ADR 0003), on a row and on the
 * thread header alike. A manager's chip reads "Your turn" only on a thread they own; on an
 * Unassigned thread or a colleague's it reads "Waiting", in the same amber (ADR 0022, 2026-10-06).
 * Only the chip changes: views and counts still go by the thread's status.
 *
 * An agent sees only their own threads (ADR 0022), so for them the owner would always say
 * "Yours": they get no owner badge (#94). `parts` splits the set for the phone's thread, whose
 * header keeps the turn and whose details strip takes the pipe and the owner (#94).
 */
export function ThreadFlags({
	conversation,
	parts = "all",
}: {
	conversation: Pick<
		ConversationSummary,
		"pipe" | "owner" | "unansweredInboundId" | "crm" | "lastGuestInboundAt"
	>;
	parts?: "all" | "meta" | "turn";
}) {
	const t = useTranslations("inbox");
	const status = threadStatus(conversation);
	const { userId, role, pending } = useOfficeRole();
	const owner = conversation.owner;
	const chip =
		status === "yourTurn" && role === "manager" && owner?.id !== userId ? "waiting" : status;
	const showOwner = pending || role === "manager";
	return (
		<>
			{parts === "turn" ? null : (
				<>
					<Badge status="neutral">{t(`pipes.${conversation.pipe}`)}</Badge>
					{showOwner ? (
						<Badge
							status="neutral"
							data-test="thread-owner"
							data-owner={!owner ? "unassigned" : owner.id === userId ? "mine" : "other"}
						>
							{!owner ? t("owner.unassigned") : owner.id === userId ? t("owner.mine") : owner.name}
						</Badge>
					) : null}
				</>
			)}
			{parts === "meta" ? null : (
				<Badge status={STATUS_BADGE[chip]} data-test="thread-status" data-status={chip}>
					{isDecided(status) ? t(`crm.${status}`) : t(chip)}
				</Badge>
			)}
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
