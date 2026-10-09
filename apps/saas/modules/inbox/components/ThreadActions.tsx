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
	Label,
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
	Textarea,
	toast,
} from "@repo/ui";
import { MoreHorizontalIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, useState } from "react";

import { guestLabel } from "../lib/display-name";
import { InboxApiError, useDeleteGuest, useOfficeRole } from "../lib/inbox-queries";
import type { Conversation, GuestDeletionReason } from "../lib/types";

/** The reasons a manager chooses from (ADR 0020), in the order the dialog lists them. */
const REASONS = [
	"guest_request",
	"duplicate_or_spam",
	"test_data",
	"other",
] as const satisfies readonly GuestDeletionReason[];
/** The longest note the server takes (`GUEST_DELETION_NOTE_MAX`). */
const NOTE_MAX = 500;

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
 * it can't be undone, why (a reason, and a note that "Other" requires), and a destructive
 * confirm that shows pending while the request runs. Plain kit controls; the server masks
 * phone numbers and emails in the note.
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
	const reasonId = useId();
	const noteId = useId();
	const [reason, setReason] = useState<GuestDeletionReason | null>(null);
	const [note, setNote] = useState("");
	const noteMissing = reason === "other" && !note.trim();

	/** Closed, the dialog forgets its reason and note: each opening starts fresh. */
	function setOpen(next: boolean) {
		if (!next) {
			setReason(null);
			setNote("");
		}
		onOpenChange(next);
	}

	async function onConfirm() {
		if (!reason || noteMissing) return;
		try {
			await deleteGuest.mutateAsync({
				id: conversation.id,
				deleteInCrm: false,
				reason,
				note: note.trim() || null,
			});
			setOpen(false);
			toast.add({ title: t("done"), type: "success" });
		} catch (error) {
			const code = error instanceof InboxApiError ? error.code : null;
			if (code === "not_found") {
				setOpen(false);
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
		<AlertDialog open={open} onOpenChange={(next) => !pending && setOpen(next)}>
			<AlertDialogContent data-test="delete-guest-dialog">
				<AlertDialogHeader>
					<AlertDialogTitle>{t("title", { name: guestLabel(conversation).text })}</AlertDialogTitle>
					<AlertDialogDescription>
						{t("what", { count: conversation.messages.length })}
					</AlertDialogDescription>
				</AlertDialogHeader>
				<p className="text-sm text-muted-foreground">
					{conversation.pipe === "zalo" ? t("keptZalo") : t("keptWhatsapp")}
				</p>
				<p className="text-sm font-medium">{t("irreversible")}</p>
				<div className="gap-2 flex flex-col">
					<Label htmlFor={reasonId}>{t("reasonLabel")}</Label>
					<Select
						value={reason}
						items={REASONS.map((value) => ({ value, label: t(`reasons.${value}`) }))}
						onValueChange={(value) => setReason(value as GuestDeletionReason | null)}
						disabled={pending}
					>
						<SelectTrigger id={reasonId} aria-label={t("reasonLabel")}>
							<SelectValue placeholder={t("reasonPlaceholder")} />
						</SelectTrigger>
						<SelectContent>
							{REASONS.map((value) => (
								<SelectItem key={value} value={value}>
									{t(`reasons.${value}`)}
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</div>
				<div className="gap-2 flex flex-col">
					<Label htmlFor={noteId}>{reason === "other" ? t("noteLabel") : t("noteOptional")}</Label>
					<Textarea
						id={noteId}
						value={note}
						maxLength={NOTE_MAX}
						onChange={(event) => setNote(event.target.value)}
						disabled={pending}
						aria-describedby={`${noteId}-hint`}
					/>
					<p id={`${noteId}-hint`} className="text-xs text-muted-foreground">
						{t("noteHint")}
					</p>
					{noteMissing ? (
						<p className="text-xs text-muted-foreground">{t("noteRequired")}</p>
					) : null}
				</div>
				<AlertDialogFooter>
					<AlertDialogCancel disabled={pending}>{t("cancel")}</AlertDialogCancel>
					<Button
						type="button"
						variant="destructive"
						loading={pending}
						disabled={!reason || noteMissing}
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
