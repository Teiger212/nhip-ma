"use client";

import { cn } from "@repo/ui";
import { useTranslations } from "next-intl";

import { useOfficeLanguage } from "../lib/inbox-queries";
import type { OfficeLine as Line } from "../lib/office-line";

/**
 * An outgoing text's operator line (#242), muted: inside the office's bubble, or under the reply
 * box (#248, layout D). Its label says what it is: the template in the office language ("In
 * English"), or the model's translation ("Translation"). Rendered as text, never as markup.
 */
export function OfficeLine({ line, className }: { line: Line; className?: string }) {
	const t = useTranslations("inbox");
	const officeLanguage = useOfficeLanguage().data;
	const label =
		line.label === "inLanguage"
			? t(`inLanguage.${line.language}`)
			: line.language === officeLanguage
				? t("translation")
				: t("translationIn", { language: t(`guestLanguage.${line.language}`) });
	return (
		<p
			data-test="office-line"
			className={cn("text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground", className)}
		>
			<span data-test="office-line-label" className="font-medium block">
				{label}
			</span>
			{line.text}
		</p>
	);
}
