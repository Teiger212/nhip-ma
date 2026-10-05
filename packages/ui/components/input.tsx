import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "../lib";

const inputVariants = cva(
	"flex w-full text-base transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-foreground/60 focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "h-9 shadow-xs px-3 py-1 rounded-xl border border-input bg-card",
				/** A filled search field with room for a leading icon at left-4. */
				search: "h-12 px-4 py-3 pl-12 rounded-md border border-transparent bg-muted",
			},
		},
		defaultVariants: {
			variant: "default",
		},
	},
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
	VariantProps<typeof inputVariants>;

const Input = ({ className, type, variant, ...props }: InputProps) => {
	return <input type={type} className={cn(inputVariants({ variant }), className)} {...props} />;
};

export { Input };
