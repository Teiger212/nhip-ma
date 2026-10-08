"use client";

import { ChevronRightIcon } from "lucide-react";
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

/** The rail's rows: a label/value grid. */
function RowGrid({ rows }: { rows: ExtractRow[] }) {
	const text = useExtractRowText();
	return (
		<dl className="gap-x-3 gap-y-2 text-sm min-w-0 grid-cols-fields grid">
			{rows.map((row) => {
				const { label, value } = text(row);
				return (
					<div key={row.id} className="contents">
						<dt className="text-muted-foreground">{label}</dt>
						<dd
							className={
								row.present
									? "min-w-0 font-medium text-foreground"
									: "min-w-0 text-muted-foreground"
							}
						>
							{value}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

/** The strip's rows: label and value pairs running along one line, wrapping when they must. */
function RowLine({ rows }: { rows: ExtractRow[] }) {
	const text = useExtractRowText();
	return (
		<dl className="gap-x-4 gap-y-1 min-w-0 flex flex-wrap items-baseline">
			{rows.map((row) => {
				const { label, value } = text(row);
				return (
					<div key={row.id} className="gap-1.5 min-w-0 flex items-baseline">
						<dt className="shrink-0 text-muted-foreground">{label}</dt>
						<dd className={row.present ? "font-medium text-foreground" : "text-muted-foreground"}>
							{value}
						</dd>
					</div>
				);
			})}
		</dl>
	);
}

/**
 * The one-shot extraction (Qualification, paperwork): present rows first, missing ones folded
 * under "N missing". In the details rail a label/value grid; in the narrow pane's strip under the
 * header (#248), the present rows on one line and the disclosure on the next.
 */
export function ExtractFields({
	conversation,
	layout,
}: {
	conversation: Conversation;
	layout: "rail" | "strip";
}) {
	const t = useTranslations("inbox");
	const arranged = useMemo(() => arrangeExtractRows(conversation.oneShot), [conversation.oneShot]);
	const Rows = layout === "rail" ? RowGrid : RowLine;
	const missing =
		arranged.collapsed.length > 0 ? (
			<details className="group">
				<summary className="gap-1 text-xs md:min-h-6 min-h-11 flex w-fit cursor-pointer items-center rounded-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden motion-reduce:transition-none">
					<ChevronRightIcon
						aria-hidden="true"
						className="size-3.5 transition-transform duration-200 group-open:rotate-90 motion-reduce:transition-none"
					/>
					{t("missingFields", { count: arranged.collapsed.length })}
				</summary>
				<div className="mt-1.5">
					<Rows rows={arranged.collapsed} />
				</div>
			</details>
		) : null;
	if (layout === "rail") {
		return (
			<div className="gap-2 flex flex-col">
				<RowGrid rows={arranged.visible} />
				{missing}
			</div>
		);
	}
	return (
		<div
			data-test="thread-details"
			className="gap-0.5 px-3 py-2 text-xs md:px-4 flex shrink-0 flex-col border-b bg-muted/40"
		>
			<RowLine rows={arranged.visible} />
			{missing}
		</div>
	);
}
