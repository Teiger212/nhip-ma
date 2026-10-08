"use client";

import {
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
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
 * The open thread's owner (ADR 0022). A manager's is "Assign to…", the kit's Select showing who
 * holds the thread: Unassigned, then the office's operators in the order a row's "Assign to…"
 * lists them. Choosing acts at once, and the last assignment wins. In the details rail it fills
 * the Owner section; in a narrow pane's header (#248) it sits there, a smaller field. An
 * agent can't assign: the rail names the owner, read-only, and the header has nothing more (the
 * owner badge in its flags already says whose it is).
 */
export function OwnerControl({
	conversation,
	placement,
}: {
	conversation: Conversation;
	placement: "rail" | "header";
}) {
	const t = useTranslations("inbox.owner");
	const { role, userId } = useOfficeRole();
	const agents = useOfficeAgents(role === "manager");
	const setOwner = useSetOwner();
	const owner = conversation.owner;
	if (role !== "manager") {
		if (placement === "header") return null;
		return (
			<p className="text-sm font-medium">
				{!owner ? t("unassigned") : owner.id === userId ? t("mine") : owner.name}
			</p>
		);
	}
	const items = [
		{ value: UNASSIGNED, label: t("unassigned") },
		...(agents.data ?? []).map((agent) => ({ value: agent.id, label: agent.name })),
	];
	// An owner the list doesn't hold (yet) still shows by name, never as an id.
	if (owner && !items.some((item) => item.value === owner.id)) {
		items.push({ value: owner.id, label: owner.name });
	}
	return (
		<Select
			items={items}
			value={owner?.id ?? UNASSIGNED}
			disabled={setOwner.isPending || !agents.data}
			onValueChange={(value) => {
				if (!value) return;
				setOwner.mutate(
					{ id: conversation.id, ownerId: value === UNASSIGNED ? null : value },
					{ onError: () => toast.add({ title: t("failed"), type: "error" }) },
				);
			}}
		>
			<SelectTrigger
				data-test="thread-owner-select"
				aria-label={t("assignTo")}
				title={t("assignTo")}
				size={placement === "header" ? "sm" : "md"}
				className={placement === "header" ? "w-44" : "w-full"}
			>
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{items.map((item) => (
					<SelectItem key={item.value} value={item.value}>
						{item.label}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
