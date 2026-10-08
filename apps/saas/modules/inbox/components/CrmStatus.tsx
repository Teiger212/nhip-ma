"use client";

import { Badge, BadgeLink } from "@repo/ui/components/badge";
import { ExternalLinkIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { Conversation } from "../lib/types";

/**
 * The thread's lead in the office's CRM (ADR 0003), read-only for everyone: metadata, so a
 * neutral squared badge (DESIGN.md, The Pill Acts Rule). Where the CRM has a web app and Nhịp
 * knows the office's account there (HubSpot), "In CRM" opens the lead in it, in a new tab (CRM
 * 10); the address comes from the server, built from stored ids. With a CRM and no lead yet it
 * says "Not in CRM yet" (#211), neutral too: a lead Nhịp hasn't written is not an error (The Red
 * Means Broken Rule). Nothing when the office has no CRM.
 */
export function CrmStatus({
	conversation,
}: {
	conversation: Pick<Conversation, "crm" | "officeHasCrm">;
}) {
	const t = useTranslations("inbox.crm");
	if (conversation.crm?.leadUrl) {
		return (
			<BadgeLink
				status="neutral"
				href={conversation.crm.leadUrl}
				target="_blank"
				rel="noopener noreferrer"
				data-test="crm-status"
			>
				{t("inCrm")}
				<ExternalLinkIcon aria-hidden />
			</BadgeLink>
		);
	}
	if (conversation.crm) {
		return (
			<Badge status="neutral" data-test="crm-status">
				{t("inCrm")}
			</Badge>
		);
	}
	if (!conversation.officeHasCrm) return null;
	return (
		<Badge status="neutral" data-test="crm-status">
			{t("notInCrmYet")}
		</Badge>
	);
}
