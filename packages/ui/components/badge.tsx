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
			/**
			 * A count pinned to an icon's corner (the collapsed sidebar's Inbox count, #94): 16px tall,
			 * the 11px floor of the type ramp, as narrow as its digits allow.
			 */
			corner: [
				"h-4",
				"min-w-4",
				"justify-center",
				"rounded-md",
				"px-1",
				"text-micro",
				"font-medium",
			],
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
			/**
			 * Solid Dispatch Blue: the one count that rides on a control (the bell's unread, #303), where
			 * a 12% tint on the blue canvas reads as a label rather than a count.
			 */
			primary: ["bg-primary", "text-primary-foreground"],
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

export type BadgeLinkProps = React.AnchorHTMLAttributes<HTMLAnchorElement> &
	VariantProps<typeof badge>;

/**
 * A badge that opens something elsewhere (DESIGN.md, Badges): still squared metadata, not a pill,
 * with a small trailing icon the caller passes. Hover darkens its text to ink; keyboard focus
 * shows the ring.
 */
export const BadgeLink = ({
	children,
	className,
	status,
	size,
	numeric,
	...props
}: BadgeLinkProps) => (
	<a
		className={cn(
			badge({ status, size, numeric }),
			"gap-1 ease-out [&>svg]:size-3 transition-colors duration-200 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none [&>svg]:shrink-0",
			className,
		)}
		{...props}
	>
		{children}
	</a>
);

BadgeLink.displayName = "BadgeLink";
