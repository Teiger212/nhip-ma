"use client";

import { Dialog as SheetPrimitive } from "@base-ui/react/dialog";
import type { VariantProps } from "class-variance-authority";
import { cva } from "class-variance-authority";
import { XIcon } from "lucide-react";
import * as React from "react";

import { cn } from "../lib";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

/**
 * The app's sheets (the phone thread's details, the phone menu) move on Nhịp's timing (#330):
 * in over 300ms on the kit curve, out in 200ms on the exit curve, the backdrop fading in 240ms and
 * out in 200ms, with no blur over the screen. The top and right sheets (the marketing site's
 * menu) keep the kit's 500ms over a blur.
 */
const quickSides = new Set(["bottom", "left"]);

const SheetOverlay = ({
	className,
	quick = false,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Backdrop> & { quick?: boolean }) => (
	<SheetPrimitive.Backdrop
		className={cn(
			"data-[closed]:fade-out-0 data-[open]:fade-in-0 inset-0 data-[closed]:animate-out data-[open]:animate-in fixed z-50 bg-background/80",
			quick
				? "data-[open]:ease-out data-[closed]:ease-exit data-[closed]:duration-200 data-[open]:duration-240"
				: "backdrop-blur-xs",
			className,
		)}
		{...props}
	/>
);

const sheetVariants = cva(
	"fixed z-50 gap-4 p-6 shadow-lg data-[open]:animate-in data-[closed]:animate-out",
	{
		variants: {
			side: {
				top: "inset-x-0 top-0 border-b bg-background transition ease-in-out data-[closed]:duration-300 data-[open]:duration-500 data-[closed]:slide-out-to-top data-[open]:slide-in-from-top",
				/**
				 * A bottom sheet (the phone thread's guest details, #327): paper with 16px top corners,
				 * at most 85% of the screen and scrolling past it, clear of the home indicator. From `md`
				 * it keeps to a reading width, centred.
				 */
				bottom:
					"data-[open]:duration-300 data-[open]:ease-kit data-[closed]:duration-200 data-[closed]:ease-exit inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto overscroll-contain rounded-t-2xl border-t bg-card pb-[max(1.5rem,env(safe-area-inset-bottom))] md:mx-auto md:max-w-xl md:border-x data-[closed]:slide-out-to-bottom data-[open]:slide-in-from-bottom",
				left: "data-[open]:duration-300 data-[open]:ease-kit data-[closed]:duration-200 data-[closed]:ease-exit inset-y-0 left-0 h-full bg-background w-3/4 border-r data-[closed]:slide-out-to-left data-[open]:slide-in-from-left sm:max-w-sm",
				right:
					"transition ease-in-out data-[closed]:duration-300 data-[open]:duration-500 inset-y-0 right-0 h-full bg-background w-3/4  border-l data-[closed]:slide-out-to-right data-[open]:slide-in-from-right sm:max-w-sm",
			},
		},
		defaultVariants: {
			side: "right",
		},
	},
);

type SheetContentProps = {} & React.ComponentProps<typeof SheetPrimitive.Popup> &
	VariantProps<typeof sheetVariants>;

const SheetContent = ({ side = "right", className, children, ...props }: SheetContentProps) => (
	<SheetPrimitive.Portal>
		<SheetOverlay quick={quickSides.has(side ?? "right")} />
		<SheetPrimitive.Popup className={sheetVariants({ side, className })} {...props}>
			{children}
			<SheetPrimitive.Close className="top-2 right-2 size-11 md:top-3 md:right-3 md:size-8 absolute grid place-items-center rounded-lg opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-hidden disabled:pointer-events-none">
				<XIcon className="size-4" />
				<span className="sr-only">Close</span>
			</SheetPrimitive.Close>
		</SheetPrimitive.Popup>
	</SheetPrimitive.Portal>
);

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div className={cn("space-y-2 sm:text-left flex flex-col text-center", className)} {...props} />
);

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
	<div
		className={cn("sm:flex-row sm:justify-end sm:space-x-2 flex flex-col-reverse", className)}
		{...props}
	/>
);

const SheetTitle = ({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) => (
	<SheetPrimitive.Title
		className={cn("font-extrabold text-lg tracking-tight text-foreground", className)}
		{...props}
	/>
);

const SheetDescription = ({
	className,
	...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) => (
	<SheetPrimitive.Description
		className={cn("text-sm text-muted-foreground", className)}
		{...props}
	/>
);

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetTitle,
	SheetTrigger,
};
