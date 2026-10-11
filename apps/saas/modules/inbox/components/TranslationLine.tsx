import { cn } from "@repo/ui";
import { LanguagesIcon } from "lucide-react";
import type { ReactNode } from "react";

/**
 * A line that reads a message in another language (#314): the translate glyph, then the text, in
 * Note. One look for every such line: a guest's translation, an office bubble's operator line and
 * the one under the reply box (#242). With a `label`, the glyph carries it as its accessible name
 * and title ("In English", "Translation") in place of a visible label; without one it is
 * decorative. Rendered as text, never as markup.
 */
export function TranslationLine({
	label,
	labelTestId,
	className,
	children,
	...props
}: {
	label?: string;
	labelTestId?: string;
	className?: string;
	children: ReactNode;
	"data-test"?: string;
}) {
	// Labelled, the glyph is an image named by the label; unlabelled, it is decoration.
	const named = label ? { role: "img", "aria-label": label, title: label } : {};
	return (
		<p
			className={cn("gap-2 text-note leading-normal flex whitespace-pre-wrap", className)}
			{...props}
		>
			<span
				{...named}
				data-test={labelTestId}
				className="mt-0.5 flex shrink-0 text-muted-foreground"
			>
				<LanguagesIcon aria-hidden="true" className="size-3.5" />
			</span>
			<span className="min-w-0">{children}</span>
		</p>
	);
}
