"use client";

import { Button, cn } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";

import type { SendStatus } from "../lib/send-status";
import { formatInboxTimestamp } from "../lib/time";

/**
 * The only send control (ADR 0006): one button that approves the reply for the open guest
 * message, next to what the last attempt came to. The status is decided in
 * `sendStatusFor`; this only words it.
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
		<div className="px-3 py-2 gap-3 flex shrink-0 items-center justify-between border-t bg-card bg-muted/40">
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
