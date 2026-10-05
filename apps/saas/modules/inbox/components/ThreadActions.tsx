"use client";

import {
	AlertDialog,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	Button,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
	toast,
} from "@repo/ui";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { displayName } from "../lib/display-name";
import { InboxApiError, useDeleteGuest, useOfficeRole } from "../lib/inbox-queries";
import type { Conversation } from "../lib/types";

/**
 * The thread header's ⋯ menu (ADR 0020), for a manager only: agents ask a manager, as for
 * reassign. Its one item, "Delete guest data", is neutral; only the dialog's confirm is red
 * (DESIGN.md, The Red Means Broken Rule). It is disabled while a reply is sending: an Answer in
 * `sending`, or this operator's approval still on its way.
 */
export function ThreadActions({
	conversation,
	approving,
}: {
	conversation: Conversation;
	approving: boolean;
}) {
	const t = useTranslations("inbox.deletion");
	const { role } = useOfficeRole();
	// Outside the menu: the menu unmounts its items when it closes, the dialog must stay.
	const [confirming, setConfirming] = useState(false);
	if (role !== "manager") return null;
	const sending = approving || conversation.answers.some((answer) => answer.status === "sending");
	return (
		<>
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="min-h-11 min-w-11"
							aria-label={t("actions")}
							data-test="thread-actions"
						>
							<MoreHorizontalIcon className="size-4" />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuItem
						disabled={sending}
						onClick={() => setConfirming(true)}
						data-test="delete-guest-data"
					>
						<span className="gap-0.5 flex flex-col">
							{t("delete")}
							{sending ? (
								<span className="text-xs text-muted-foreground">{t("sendingReason")}</span>
							) : null}
						</span>
					</DropdownMenuItem>
				</DropdownMenuContent>
			</DropdownMenu>
			<DeleteGuestDialog
				conversation={conversation}
				open={confirming}
				onOpenChange={setConfirming}
			/>
		</>
	);
}

/**
 * One confirmation, no typing (ADR 0020, Q5): what Nhịp deletes, what is kept elsewhere, that
 * it can't be undone, and a destructive confirm that shows pending while the request runs.
 * The CRM checkbox arrives with #139; until then the request says `deleteInCrm: false`, and a
 * thread's lead is only unlinked.
 */
export function DeleteGuestDialog({
	conversation,
	open,
	onOpenChange,
}: {
	conversation: Conversation;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const t = useTranslations("inbox.deletion");
	const deleteGuest = useDeleteGuest();
	const pending = deleteGuest.isPending;

	async function onConfirm() {
		try {
			await deleteGuest.mutateAsync({ id: conversation.id, deleteInCrm: false });
			onOpenChange(false);
			toast.add({ title: t("done"), type: "success" });
		} catch (error) {
			const code = error instanceof InboxApiError ? error.code : null;
			if (code === "not_found") {
				onOpenChange(false);
				toast.add({ title: t("gone") });
				return;
			}
			toast.add({
				title: code === "reply_sending" ? t("sendingReason") : t("failed"),
				type: "error",
			});
		}
	}

	return (
		<AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
			<AlertDialogContent data-test="delete-guest-dialog">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("title", { name: displayName(conversation) })}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("what", { count: conversation.messages.length })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<p className="text-sm text-muted-foreground">
					{conversation.pipe === "zalo" ? t("keptZalo") : t("keptWhatsapp")}
				</p>
				<p className="text-sm font-medium">{t("irreversible")}</p>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						loading={pending}
						onClick={() => void onConfirm()}
						data-variant="destructive"
					>
						{pending ? t("deleting") : t("confirm")}
					</Button>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
