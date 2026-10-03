import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type React from "react";

import { cn } from "../lib";

/**
 * Status and metadata as a small squared flag (DESIGN.md: the Pill Acts Rule, round is only
 * for things that act). Each tone is its color as text on a 12% tint of itself.
 */
export const badge = cva(["inline-flex", "items-center", "leading-none", "whitespace-nowrap"], {
	variants: {
		size: {
			md: ["h-5", "rounded-md", "px-2", "text-micro", "font-medium"],
			/** Inline beside a message's meta line: squared (status isn't a pill), sentence case. */
			sm: ["h-4", "rounded-md", "px-1.5", "text-2xs", "font-medium"],
		},
		/** A count: digits in mono with tabular figures (DESIGN.md: mono is for digits). */
		numeric: {
			true: ["font-mono", "tabular-nums"],
			false: [],
		},
		status: {
			neutral: ["bg-muted", "text-muted-foreground"],
			success: ["bg-success/12", "text-success"],
			info: ["bg-primary/12", "text-primary"],
			warning: ["bg-warning/12", "text-warning"],
			error: ["bg-destructive/12", "text-destructive"],
		},
	},
	defaultVariants: {
		status: "neutral",
		size: "md",
		numeric: false,
	},
});

export type BadgeProps = React.HtmlHTMLAttributes<HTMLDivElement> & VariantProps<typeof badge>;

export const Badge = ({ children, className, status, size, numeric, ...props }: BadgeProps) => (
	<span className={cn(badge({ status, size, numeric }), className)} {...props}>
		{children}
	</span>
);

Badge.displayName = "Badge";
