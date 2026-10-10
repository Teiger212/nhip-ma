"use client";

import { Button, cn, Textarea } from "@repo/ui";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OfficeLine as Line } from "../lib/office-line";
import type { DraftSource } from "../lib/types";
import { OfficeLine } from "./OfficeLine";

/**
 * The suggested reply, editable while a guest message waits, never sent from here: the send bar
 * approves it. Once the thread is answered the box folds away (`AnsweredLine`, #94). Beside
 * "Reply", the operator note: the language the reply is in (#248). Where the suggestion came from
 * (the model or the template, ADR 0024) is not shown (Eyal, 2026-10-10, #303); while the box
 * still holds it, the textarea carries it as `data-source` for tests, and drops it once the
 * operator types. Typed text kept after the guest wrote again says so, quietly (ADR 0024).
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
	/** The operator note: the reply's language (`crib.ts`). */
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
						{edited && guestWroteAgain ? (
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
				growOnPhone
				aria-label={t("reply")}
				data-source={edited ? undefined : draftSource}
			/>
			{officeLine ? (
				<OfficeLine line={officeLine} className="px-1 max-h-24 overflow-y-auto" />
			) : null}
		</section>
	);
}
