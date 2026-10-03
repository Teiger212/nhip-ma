"use client";

import { Badge } from "@repo/ui/components/badge";
import { useTranslations } from "next-intl";

import type { Conversation } from "../lib/types";

/**
 * The thread's lead in the office's CRM (ADR 0003), read-only for everyone: metadata, so a
 * neutral squared badge (DESIGN.md, The Pill Acts Rule). Nothing while the thread has no lead
 * or the office has no CRM.
 */
export function CrmStatus({ conversation }: { conversation: Pick<Conversation, "crm"> }) {
	const t = useTranslations("inbox.crm");
	if (!conversation.crm) return null;
	return (
		<Badge status="neutral" data-test="crm-status">
			{t("inCrm", { name: conversation.crm.leadName })}
		</Badge>
	);
}
