"use client";

import { Button } from "@repo/ui";
import { ChevronLeftIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { displayName } from "../lib/display-name";
import type { SendStatus } from "../lib/send-status";
import type { Conversation, DraftSource } from "../lib/types";
import { ExtractFields } from "./ExtractFields";
import { ReplyBox } from "./ReplyBox";
import { SendBar } from "./SendBar";
import { ThreadMessage } from "./ThreadMessage";
import { GuestMark, ThreadFlags } from "./ThreadParts";

export type ReplyState = {
	reply: string;
	edited: boolean;
	draftSource: DraftSource;
	canApprove: boolean;
	onReplyChange: (reply: string) => void;
	regenerating: boolean;
	onRegenerate: () => void;
	sending: boolean;
	status: SendStatus;
	onApprove: () => void;
};

/**
 * One open thread: who it is, every message with its translation, what the one-shot
 * extracted, the operator note, and the reply box, with the send bar pinned under it.
 * Everything here is handed in; the Inbox shell owns the state and the mutations.
 */
export function ThreadDetail({
	conversation,
	cribNotes,
	reply,
	onBack,
}: {
	conversation: Conversation;
	cribNotes: string | null;
	reply: ReplyState;
	/** Phone only: close the thread and show the list again. */
	onBack: () => void;
}) {
	const t = useTranslations("inbox");
	return (
		<>
			<header className="gap-2 px-3 py-2 flex shrink-0 flex-wrap items-center border-b bg-card/40 bg-muted/60">
				<Button
					type="button"
					variant="ghost"
					className="md:hidden min-h-11 min-w-11 gap-1 px-2"
					onClick={onBack}
					aria-label={t("backAria")}
				>
					<ChevronLeftIcon className="size-4" />
					{t("back")}
				</Button>
				<GuestMark name={displayName(conversation)} />
				<p className="font-semibold tracking-tight font-heading">{displayName(conversation)}</p>
				<ThreadFlags conversation={conversation} />
			</header>
			<div className="min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
				<div className="max-w-3xl gap-3 p-3 min-w-0 mx-auto flex flex-col">
					{conversation.messages.map((message) => (
						<ThreadMessage key={message.id} message={message} />
					))}
					<div className="border-t" />
					<ExtractFields conversation={conversation} />
					{cribNotes ? (
						<section className="gap-1.5 p-3 flex flex-col rounded-lg rounded-md border-l-2 border-l-primary bg-primary/6 bg-touch/8">
							<h2 className="font-semibold tracking-tight text-sm">{t("forYou")}</h2>
							<p className="text-xs text-muted-foreground">{t("forYouHint")}</p>
							<p className="leading-relaxed whitespace-pre-wrap">{cribNotes}</p>
						</section>
					) : null}
					<ReplyBox
						reply={reply.reply}
						onReplyChange={reply.onReplyChange}
						edited={reply.edited}
						draftSource={reply.draftSource}
						canApprove={reply.canApprove}
						regenerating={reply.regenerating}
						onRegenerate={reply.onRegenerate}
					/>
				</div>
			</div>
			<SendBar
				status={reply.status}
				canApprove={reply.canApprove}
				sending={reply.sending}
				onApprove={reply.onApprove}
			/>
		</>
	);
}
