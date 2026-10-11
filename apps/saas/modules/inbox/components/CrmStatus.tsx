"use client";

import { cn } from "@repo/ui";
import { ExternalLinkIcon, UserCheckIcon, UserXIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Conversation } from "../lib/types";

/** The CRM status reads as the pipe does: a glyph and its words in Slate, never filled. */
const STATUS =
	"gap-1.5 text-note font-semibold inline-flex items-center whitespace-nowrap text-muted-foreground";

/**
 * The thread's lead in the office's CRM (ADR 0003), read-only for everyone: metadata, so it reads
 * like the pipe beside it (#314), slate words after a glyph, never a fill. Where the CRM has a
 * web app and Nhịp knows the office's account there (HubSpot), "In CRM" opens the lead in it, in
 * a new tab (CRM 10); the address comes from the server, built from stored ids. With a CRM and no
 * lead yet it says "Not in CRM yet" (#211), neutral too: a lead Nhịp hasn't written is not an
 * error (The Red Means Broken Rule). Nothing when the office has no CRM.
 */
export function CrmStatus({
	conversation,
}: {
	conversation: Pick<Conversation, "crm" | "officeHasCrm">;
}) {
	const t = useTranslations("inbox.crm");
	if (conversation.crm?.leadUrl) {
		return (
			<a
				className={cn(
					STATUS,
					"rounded-sm transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden",
				)}
				href={conversation.crm.leadUrl}
				target="_blank"
				rel="noopener noreferrer"
				data-test="crm-status"
			>
				<UserCheckIcon aria-hidden="true" className="size-4 shrink-0" />
				{t("inCrm")}
				<ExternalLinkIcon aria-hidden="true" className="size-3 shrink-0" />
			</a>
		);
	}
	if (conversation.crm) {
		return (
			<span className={STATUS} data-test="crm-status">
				<UserCheckIcon aria-hidden="true" className="size-4 shrink-0" />
				{t("inCrm")}
			</span>
		);
	}
	if (!conversation.officeHasCrm) return null;
	return (
		<span className={STATUS} data-test="crm-status">
			<UserXIcon aria-hidden="true" className="size-4 shrink-0" />
			{t("notInCrmYet")}
		</span>
	);
}
