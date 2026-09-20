"use client";

import { useTranslations } from "next-intl";
import { useMemo } from "react";

import { arrangeExtractRows, type ExtractRow } from "../lib/extract-rows";
import type { Conversation } from "../lib/types";

/** Translate one extract row for display. Presence was decided upstream from the value. */
function useExtractRowText() {
	const t = useTranslations("inbox");
	return (row: ExtractRow): { label: string; value: string } => {
		const label = t(`fields.${row.id}`);
		if (!row.present) {
			return { label, value: row.id === "paperwork" ? t("fields.noneMentioned") : t("missing") };
		}
		switch (row.id) {
			case "language":
				return { label, value: t(`guestLanguage.${String(row.value)}`) };
			case "rentOrBuy":
				return { label, value: t(`intent.${String(row.value)}`) };
			case "inVietnamNow":
				return { label, value: row.value ? t("yes") : t("no") };
			case "paperwork":
				return { label, value: t("paperworkFlag") };
			default:
				return { label, value: String(row.value) };
		}
	};
}

function ExtractRowList({ rows }: { rows: ExtractRow[] }) {
	const text = useExtractRowText();
	return (
		<dl className="gap-x-3 gap-y-1.5 text-sm min-w-0 grid grid-cols-[minmax(7rem,auto)_minmax(0,1fr)]">
			{rows.map((row) => {
				const { label, value } = text(row);
				return (
					<div key={row.id} className="contents">
						<dt className="font-medium text-muted-foreground">{label}</dt>
						<dd className={row.present ? "font-medium text-foreground" : "text-muted-foreground"}>
							{value}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

/** The one-shot extraction (Qualification, paperwork): present rows first, missing ones folded. */
export function ExtractFields({ conversation }: { conversation: Conversation }) {
	const t = useTranslations("inbox");
	const arranged = useMemo(() => arrangeExtractRows(conversation.oneShot), [conversation.oneShot]);
	return (
		<section className="gap-2 p-3 flex flex-col rounded-lg rounded-md bg-muted bg-muted/50">
			<ExtractRowList rows={arranged.visible} />
			{arranged.collapsed.length > 0 ? (
				<details>
					<summary className="text-sm min-h-11 flex cursor-pointer items-center text-muted-foreground">
						{t("missingFields", { count: arranged.collapsed.length })}
					</summary>
					<div className="mt-2">
						<ExtractRowList rows={arranged.collapsed} />
					</div>
				</details>
			) : null}
		</section>
	);
}
