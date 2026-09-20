"use client";

import { Button, cn, Textarea } from "@repo/ui";
import { RefreshCwIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { DraftSource } from "../lib/types";

/**
 * The suggested reply, always editable, never sent from here: the send bar approves it.
 * While the box still holds the server's suggestion it says where that came from; once
 * the operator has typed, that note goes. Regenerate asks the server for a new one.
 */
export function ReplyBox({
	reply,
	onReplyChange,
	edited,
	draftSource,
	canApprove,
	regenerating,
	onRegenerate,
}: {
	reply: string;
	onReplyChange: (reply: string) => void;
	edited: boolean;
	draftSource: DraftSource;
	canApprove: boolean;
	regenerating: boolean;
	onRegenerate: () => void;
}) {
	const t = useTranslations("inbox");
	return (
		<section className="gap-1.5 flex flex-col">
			<div className="gap-2 flex flex-wrap items-center justify-between">
				<label htmlFor="inbox-reply" className="font-semibold tracking-tight text-sm font-heading">
					{t("reply")}
				</label>
				{canApprove ? (
					<div className="gap-2 flex items-center">
						{!edited ? (
							<span className="text-xs text-muted-foreground">
								{draftSource === "model" ? t("suggested.model") : t("suggested.template")}
							</span>
						) : null}
						<Button
							type="button"
							variant="ghost"
							className="h-8 min-h-8 gap-1.5 px-2 text-xs"
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
				className="min-h-28 text-sm rounded-lg rounded-md shadow-none"
				aria-label={t("reply")}
			/>
		</section>
	);
}
