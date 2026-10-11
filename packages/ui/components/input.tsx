import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "../lib";

const inputVariants = cva(
	"flex w-full text-base transition-colors file:border-0 file:bg-transparent file:font-medium file:text-sm placeholder:text-muted-foreground caret-primary focus-visible:border-ring focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
	{
		variants: {
			variant: {
				default: "h-9 px-3 py-1 rounded-lg border border-input bg-card",
				/** A white search field on the canvas, with room for a leading icon at left-3. */
				search: "h-11 md:h-9 pr-3 pl-9 text-sm rounded-lg border border-input bg-card",
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
