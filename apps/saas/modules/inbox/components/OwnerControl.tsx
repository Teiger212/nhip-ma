"use client";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	toast,
} from "@repo/ui";
import { useTranslations } from "next-intl";

import { useOfficeAgents, useOfficeRole, useSetOwner } from "../lib/inbox-queries";
import type { Conversation } from "../lib/types";

/**
 * "Assign to…" on a manager's Unassigned row (ADR 0022, DESIGN.md Thread Row): a ghost pill that
 * opens the office's operators. It sits beside the row, never in it, so it never selects the
 * row; choosing someone assigns at once, and the row leaves Unassigned.
 */
export function AssignFromRow({ conversationId }: { conversationId: string }) {
	const t = useTranslations("inbox.owner");
	const agents = useOfficeAgents(true);
	const setOwner = useSetOwner();
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger
				disabled={setOwner.isPending || !agents.data}
				render={
					// A 44px target to a thumb; the small pill itself from `md`, as the view tabs.
					<Button type="button" variant="ghost" size="sm" className="min-h-11 md:min-h-0">
						{t("assignTo")}
					</Button>
				}
			/>
			<DropdownMenuContent align="end" className="min-w-44">
				{agents.data?.map((agent) => (
					<DropdownMenuItem
						key={agent.id}
						onClick={() =>
							setOwner.mutate(
								{ id: conversationId, ownerId: agent.id },
								{ onError: () => toast.add({ title: t("failed"), type: "error" }) },
							)
						}
					>
						{agent.name}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

const UNASSIGNED = "__unassigned__";

/**
 * "Assign to…": a manager gives the thread to an operator of the office, or back to Unassigned
 * (ADR 0022). It acts at once, and the last assignment wins. Agents see nothing here: who holds
 * a thread is shown on its flags.
 */
export function OwnerControl({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox.owner");
	const { role } = useOfficeRole();
	const agents = useOfficeAgents(role === "manager");
	const setOwner = useSetOwner();
	if (role !== "manager") return null;
	return (
		<label className="gap-2 text-xs ml-auto flex items-center text-muted-foreground">
			{t("assignTo")}
			<select
				data-test="thread-owner-select"
				className="h-8 px-2 text-sm rounded-md border bg-background text-foreground"
				value={conversation.owner?.id ?? UNASSIGNED}
				disabled={setOwner.isPending || !agents.data}
				onChange={(event) => {
					const ownerId = event.target.value === UNASSIGNED ? null : event.target.value;
					setOwner.mutate(
						{ id: conversation.id, ownerId },
						{ onError: () => toast.add({ title: t("failed"), type: "error" }) },
					);
				}}
			>
				<option value={UNASSIGNED}>{t("unassigned")}</option>
				{agents.data?.map((agent) => (
					<option key={agent.id} value={agent.id}>
						{agent.name}
					</option>
				))}
			</select>
		</label>
	);
}
