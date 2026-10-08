"use client";

import { cn } from "@repo/ui";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { arrangeExtractRows, type ExtractFieldId, type ExtractRow } from "../lib/extract-rows";
import { isSupportedLanguage, languageName } from "../lib/language-name";
import type { Conversation } from "../lib/types";

/** One label and value of the details, as the operator reads it. */
type Detail = {
	key: string;
	label: string;
	value: string;
	/** What the guest still owes, in the Waiting tone (#244). */
	missing?: boolean;
};

/**
 * The details to show, translated: every known fact, then one "Missing" row naming what the agent
 * should still ask for (#244). Presence was decided upstream from the values; nothing missing, no row.
 */
function useDetails(rows: ExtractRow[], missing: ExtractFieldId[]): Detail[] {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const value = (row: ExtractRow): string => {
		switch (row.id) {
			case "language": {
				// An unsupported guest language is named, with the note that replies are English (#245).
				const code = String(row.value);
				const name = languageName(code, locale, (language) => t(`guestLanguage.${language}`));
				return isSupportedLanguage(code) ? name : t("languageUnsupported", { language: name });
			}
			case "rentOrBuy":
				return t(`intent.${String(row.value)}`);
			case "inVietnamNow":
				return row.value ? t("yes") : t("no");
			case "paperwork":
				return t("paperworkFlag");
			default:
				return String(row.value);
		}
	};
	const details: Detail[] = rows.map((row) => ({
		key: row.id,
		label: t(`fields.${row.id}`),
		value: value(row),
	}));
	if (missing.length > 0) {
		details.push({
			key: "missing",
			label: t("missingLabel"),
			value: missing.map((id) => t(`fields.${id}`).toLocaleLowerCase(locale)).join(", "),
			missing: true,
		});
	}
	return details;
}

/** A value in ink, or, for what is missing, in the Waiting tone. */
function valueTone(detail: Detail): string {
	return detail.missing ? "font-medium text-warning" : "font-medium text-foreground";
}

/** The rail's details: a label/value grid. */
function DetailGrid({ details }: { details: Detail[] }) {
	return (
		<dl className="gap-x-3 gap-y-2 text-sm min-w-0 grid-cols-fields grid">
			{details.map((detail) => (
				<div key={detail.key} className="contents">
					<dt className="text-muted-foreground">{detail.label}</dt>
					<dd className={cn("min-w-0", valueTone(detail))}>{detail.value}</dd>
				</div>
			))}
		</dl>
	);
}

/** The strip's details: label and value pairs running along one line, wrapping when they must. */
function DetailLine({ details }: { details: Detail[] }) {
	return (
		<dl className="gap-x-4 gap-y-1 min-w-0 flex flex-wrap items-baseline">
			{details.map((detail) => (
				<div key={detail.key} className="gap-1.5 min-w-0 flex items-baseline">
					<dt className="shrink-0 text-muted-foreground">{detail.label}</dt>
					<dd className={valueTone(detail)}>{detail.value}</dd>
				</div>
			))}
		</dl>
	);
}

/**
 * The one-shot extraction (Qualification, paperwork): the known facts, and a last row naming what
 * is still to ask. In the details rail a label/value grid; in the narrow pane's strip under the
 * header (#248), the same pairs along a line.
 */
export function ExtractFields({
	conversation,
	layout,
}: {
	conversation: Conversation;
	layout: "rail" | "strip";
}) {
	const { rows, missing } = useMemo(
		() => arrangeExtractRows(conversation.oneShot),
		[conversation.oneShot],
	);
	const details = useDetails(rows, missing);
	if (layout === "rail") {
		return <DetailGrid details={details} />;
	}
	return (
		<div
			data-test="thread-details"
			className="px-3 py-2 text-xs md:px-4 flex shrink-0 flex-col border-b bg-muted/40"
		>
			<DetailLine details={details} />
		</div>
	);
}
