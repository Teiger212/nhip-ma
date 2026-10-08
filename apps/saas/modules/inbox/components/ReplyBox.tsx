"use client";

import { Button, cn, Textarea } from "@repo/ui";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DraftSource } from "../lib/types";

/**
 * The suggested reply, always editable, never sent from here: the send bar approves it. Beside
 * "Reply", the operator note, one line on how to answer (#248). While the box still holds the
 * server's suggestion it says where that came from; once the operator has typed, that goes.
 * Regenerate asks the server for a new one.
 */
export function ReplyBox({
	reply,
	onReplyChange,
	edited,
	draftSource,
	canApprove,
	regenerating,
	onRegenerate,
	note,
}: {
	reply: string;
	onReplyChange: (reply: string) => void;
	edited: boolean;
	draftSource: DraftSource;
	canApprove: boolean;
	regenerating: boolean;
	onRegenerate: () => void;
	/** The operator note: the reply's language and "don't interview" (`crib.ts`). */
	note: string | null;
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
		</section>
	);
}
