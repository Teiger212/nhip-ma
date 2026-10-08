"use client";

import { Button, cn, Textarea } from "@repo/ui";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OfficeLine as Line } from "../lib/office-line";
import type { DraftSource } from "../lib/types";
import { OfficeLine } from "./OfficeLine";

/**
 * The suggested reply, always editable, never sent from here: the send bar approves it. Beside
 * "Reply", the operator note, one line on how to answer (#248). While the box still holds the
 * server's suggestion it says where that came from; once the operator has typed, that goes.
 * Typed text kept after the guest wrote again says so, quietly, in its place (ADR 0024).
 * Under the box, the suggestion in the office language (#242), until the operator types.
 * Regenerate asks the server for a new one.
 */
export function ReplyBox({
	reply,
	onReplyChange,
	edited,
	guestWroteAgain,
	draftSource,
	canApprove,
	regenerating,
	onRegenerate,
	note,
	officeLine,
}: {
	reply: string;
	onReplyChange: (reply: string) => void;
	edited: boolean;
	guestWroteAgain: boolean;
	draftSource: DraftSource;
	canApprove: boolean;
	regenerating: boolean;
	onRegenerate: () => void;
	/** The operator note: the reply's language and "don't interview" (`crib.ts`). */
	note: string | null;
	/** The suggestion's operator line (`suggestionLine`): null once edited, or with none. */
	officeLine: Line | null;
}) {
	const t = useTranslations("inbox");
	return (
		<section className="gap-2 flex flex-col">
			<div className="gap-x-2 gap-y-0.5 flex flex-wrap items-center">
				<label htmlFor="inbox-reply" className="font-semibold tracking-tight text-sm font-heading">
					{t("reply")}
				</label>
				{note ? (
					<p className="text-xs min-w-0 text-muted-foreground" title={t("forYouHint")}>
						<span className="sr-only">{t("forYou")}: </span>
						{note}
					</p>
				) : null}
				{canApprove ? (
					<div className="gap-2 ml-auto flex items-center">
						{!edited ? (
							<span className="text-xs text-muted-foreground">
								{draftSource === "model" ? t("suggested.model") : t("suggested.template")}
							</span>
						) : guestWroteAgain ? (
							<span data-test="guest-wrote-again" className="text-xs text-muted-foreground">
								{t("guestWroteAgain")}
							</span>
						) : null}
						<Button
							type="button"
							variant="ghost"
							size="sm"
							className="min-h-11"
							disabled={regenerating}
							onClick={onRegenerate}
						>
							<RefreshCwIcon
								aria-hidden="true"
								className={cn("size-3.5", regenerating && "animate-spin")}
							/>
							{regenerating ? t("regenerating") : t("regenerate")}
						</Button>
					</div>
				) : null}
			</div>
			<Textarea
				id="inbox-reply"
				value={reply}
				onChange={(event) => onReplyChange(event.target.value)}
				className="min-h-20 max-h-48"
				aria-label={t("reply")}
			/>
			{officeLine ? (
				<OfficeLine line={officeLine} className="px-1 max-h-24 overflow-y-auto" />
			) : null}
		</section>
	);
}
