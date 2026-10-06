"use client";

import { Badge } from "@repo/ui/components/badge";
import { useTranslations } from "next-intl";

import type { Conversation } from "../lib/types";

/**
 * The thread's lead in the office's CRM (ADR 0003), read-only for everyone: metadata, so a
 * neutral squared badge (DESIGN.md, The Pill Acts Rule). With a CRM and no lead yet it says
 * "Not in CRM yet" (#211), neutral too: a lead Nhịp hasn't written is not an error (The Red Means
 * Broken Rule). Nothing when the office has no CRM.
 */
export function CrmStatus({
	conversation,
}: {
	conversation: Pick<Conversation, "crm" | "officeHasCrm">;
}) {
	const t = useTranslations("inbox.crm");
	if (conversation.crm) {
		return (
			<Badge status="neutral" data-test="crm-status">
				{t("inCrm", { name: conversation.crm.leadName })}
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
