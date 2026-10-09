"use client";

import { Button, cn } from "@repo/ui";
import { CheckIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";

import type { SendStatus } from "../lib/send-status";
import { formatInboxTimestamp } from "../lib/time";

/**
 * The only send control (ADR 0006): one button that approves the reply for the open guest
 * message, next to what the last attempt came to: the last row of the reply box docked under the
 * conversation (#248). The status is decided in `sendStatusFor`; this only words it. While no
 * guest message waits, the box folds to `AnsweredLine` instead (#94).
 */
export function SendBar({
	status,
	canApprove,
	sending,
	onApprove,
	blockedReason,
}: {
	status: SendStatus;
	canApprove: boolean;
	sending: boolean;
	onApprove: () => void;
	/** Why nothing can be sent on this thread right now (a disconnected pipe, ADR 0017). */
	blockedReason?: string;
}) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const text = blockedReason
		? blockedReason
		: status.kind === "sending"
			? t("sending")
			: status.kind === "error"
				? status.message
				: status.kind === "unknown"
					? t("deliveryUnknown")
					: status.kind === "sent"
						? t("alreadySent", { at: formatInboxTimestamp(status.at, locale) })
						: t("notSent");
	const warn = Boolean(blockedReason) || status.kind === "error" || status.kind === "unknown";
	const quiet = !blockedReason && status.kind === "none";
	return (
		<div className="gap-3 flex items-center justify-between">
			<output
				data-test="send-status"
				aria-live="polite"
				aria-atomic="true"
				className={cn(
					"text-xs",
					quiet
						? "sr-only"
						: cn(
								"font-medium min-w-0 flex-1 truncate",
								warn ? "text-destructive" : "text-muted-foreground",
							),
				)}
			>
				{text}
			</output>
			<Button
				type="button"
				variant="primary"
				className="min-h-11 ml-auto shrink-0"
				disabled={!canApprove || sending || Boolean(blockedReason)}
				data-test="approve-and-send"
				onClick={onApprove}
			>
				{t("approveAndSend")}
			</Button>
		</div>
	);
}

/**
 * The docked reply box, folded while no guest message waits for an answer (#94): one line saying
 * the thread is answered, when, and that the guest has the next word. No draft and no disabled
 * Approve; when the guest writes again, the reply box comes back. It keeps the send status's
 * place, so it is the same polite live region.
 */
export function AnsweredLine({ sentAt }: { sentAt: string | null }) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	return (
		<div className="gap-2 min-h-11 flex items-center">
			<CheckIcon aria-hidden="true" className="size-3.5 shrink-0 text-success" />
			<output
				data-test="send-status"
				aria-live="polite"
				aria-atomic="true"
				className="text-xs min-w-0 text-pretty text-muted-foreground"
			>
				{sentAt ? t("answered", { at: formatInboxTimestamp(sentAt, locale) }) : t("answeredNoTime")}
			</output>
		</div>
	);
}
