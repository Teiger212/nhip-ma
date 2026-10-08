"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

import { arrangeExtractRows, type ExtractFieldId, type ExtractRow } from "../lib/extract-rows";
import { isSupportedLanguage, languageName } from "../lib/language-name";
import type { Conversation } from "../lib/types";

/** Translate one extract row for display. Every row is a known fact, decided upstream. */
function useExtractRowText() {
	const t = useTranslations("inbox");
	const locale = useLocale();
	return (row: ExtractRow): { label: string; value: string } => {
		const label = t(`fields.${row.id}`);
		switch (row.id) {
			case "language": {
				// An unsupported guest language is named, with the note that replies are English (#245).
				const code = String(row.value);
				const name = languageName(code, locale, (language) => t(`guestLanguage.${language}`));
				return {
					label,
					value: isSupportedLanguage(code) ? name : t("languageUnsupported", { language: name }),
				};
			}
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
						<dd className="min-w-0 font-medium text-foreground">{value}</dd>
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
						<dd className="font-medium text-foreground">{value}</dd>
					</div>
				);
			})}
		</dl>
	);
}

/**
 * What the agent should still ask for, named: "Missing: budget, move-in" (#244). Plain text, not a
 * control (DESIGN.md, The Pill Acts Rule); nothing missing, no line.
 */
function MissingLine({ missing }: { missing: ExtractFieldId[] }) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	if (missing.length === 0) return null;
	const fields = missing.map((id) => t(`fields.${id}`).toLocaleLowerCase(locale)).join(", ");
	return <p className="text-xs text-muted-foreground">{t("missingLine", { fields })}</p>;
}

/**
 * The one-shot extraction (Qualification, paperwork): the known facts, then the line naming what
 * is still to ask. In the details rail a label/value grid; in the narrow pane's strip under the
 * header (#248), the facts on one line and the missing line on the next.
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
	if (layout === "rail") {
		return (
			<div className="gap-2 flex flex-col">
				<RowGrid rows={rows} />
				<MissingLine missing={missing} />
			</div>
		);
	}
	return (
		<div
			data-test="thread-details"
			className="gap-0.5 px-3 py-2 text-xs md:px-4 flex shrink-0 flex-col border-b bg-muted/40"
		>
			<RowLine rows={rows} />
			<MissingLine missing={missing} />
		</div>
	);
}
