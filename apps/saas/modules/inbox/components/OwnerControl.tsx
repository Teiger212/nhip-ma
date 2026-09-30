"use client";

import { toast } from "@repo/ui";
import { useTranslations } from "next-intl";

import { useOfficeAgents, useOfficeRole, useSetOwner } from "../lib/inbox-queries";
import type { Conversation } from "../lib/types";

const POOL = "__pool__";

/**
 * A manager gives the thread to an agent of the office, or back to the pool (ADR 0015).
 * Agents see nothing here: who holds a thread is shown on its flags.
 */
export function OwnerControl({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox.owner");
	const { role } = useOfficeRole();
	const agents = useOfficeAgents(role === "manager");
	const setOwner = useSetOwner();
	if (role !== "manager") return null;
	return (
		<label className="gap-2 text-xs ml-auto flex items-center text-muted-foreground">
			{t("label")}
			<select
				data-test="thread-owner-select"
				className="h-8 px-2 text-sm rounded-md border bg-background text-foreground"
				value={conversation.owner?.id ?? POOL}
				disabled={setOwner.isPending || !agents.data}
				onChange={(event) => {
					const ownerId = event.target.value === POOL ? null : event.target.value;
					setOwner.mutate(
						{ id: conversation.id, ownerId },
						{ onError: () => toast.add({ title: t("failed"), type: "error" }) },
					);
				}}
			>
				<option value={POOL}>{t("pool")}</option>
				{agents.data?.map((agent) => (
					<option key={agent.id} value={agent.id}>
						{agent.name}
					</option>
				))}
			</select>
		</label>
	);
}
