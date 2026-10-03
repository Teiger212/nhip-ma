import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import type React from "react";

import { cn } from "../lib";

export const badge = cva(["inline-block", "leading-tight"], {
	variants: {
		size: {
			md: ["rounded-full", "px-3", "py-1", "text-xs", "uppercase", "font-semibold"],
			/** Inline beside a message's meta line: squared (status isn't a pill), sentence case. */
			sm: ["h-4", "rounded-md", "px-1.5", "text-2xs", "font-medium"],
		},
		status: {
			success: ["bg-success/10", "text-success"],
			info: ["bg-primary/10", "text-primary"],
			warning: ["bg-warning/10", "text-warning"],
			error: ["bg-destructive/10", "text-destructive"],
		},
	},
	defaultVariants: {
		status: "info",
		size: "md",
	},
});

export type BadgeProps = React.HtmlHTMLAttributes<HTMLDivElement> & VariantProps<typeof badge>;

export const Badge = ({ children, className, status, size, ...props }: BadgeProps) => (
	<span className={cn(badge({ status, size }), className)} {...props}>
		{children}
	</span>
);

Badge.displayName = "Badge";
