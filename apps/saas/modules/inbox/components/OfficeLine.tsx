"use client";

import { cn } from "@repo/ui";
import { useTranslations } from "next-intl";

import { useOfficeLanguage } from "../lib/inbox-queries";
import type { OfficeLine as Line } from "../lib/office-line";
import { TranslationLine } from "./TranslationLine";

/**
 * An outgoing text's operator line (#242), muted: inside the office's bubble, or under the reply
 * box (#248, layout D), drawn as the thread's translation lines are: the translate glyph, then the
 * text (#314). The glyph's accessible name and title say what it is: the template in the office
 * language ("In English"), or the model's translation ("Translation"). Rendered as text, never as
 * markup.
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
		<TranslationLine
			data-test="office-line"
			label={label}
			labelTestId="office-line-label"
			className={cn("text-muted-foreground", className)}
		>
			{line.text}
		</TranslationLine>
	);
}
