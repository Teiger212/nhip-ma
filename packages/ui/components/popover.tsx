"use client";

import { Popover as PopoverPrimitive } from "@base-ui/react/popover";
import * as React from "react";

import { cn } from "../lib";

const Popover = PopoverPrimitive.Root;

const PopoverTrigger = PopoverPrimitive.Trigger;

type PopoverPositionerProps = React.ComponentProps<typeof PopoverPrimitive.Positioner>;

/**
 * `layout="list"`: a popover that is a list of its own rows (the notification bell), with no
 * padding of its own and as wide as the screen allows, up to 22rem.
 */
const PopoverContent = ({
	className,
	align = "center",
	side,
	sideOffset = 4,
	layout = "default",
	...props
}: React.ComponentProps<typeof PopoverPrimitive.Popup> & {
	align?: PopoverPositionerProps["align"];
	side?: PopoverPositionerProps["side"];
	sideOffset?: number;
	layout?: "default" | "list";
}) => (
	<PopoverPrimitive.Portal>
		<PopoverPrimitive.Positioner className="z-50" align={align} side={side} sideOffset={sideOffset}>
			<PopoverPrimitive.Popup
				className={cn(
					"data-[closed]:fade-out-0 data-[open]:fade-in-0 data-[closed]:zoom-out-95 data-[open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 shadow-md data-[closed]:animate-out data-[open]:animate-in z-50 origin-[var(--transform-origin)] rounded-lg border bg-popover text-popover-foreground outline-hidden",
					layout === "list" ? "p-0 w-[min(100vw-2rem,22rem)]" : "w-72 p-4",
					className,
				)}
				{...props}
			/>
		</PopoverPrimitive.Positioner>
	</PopoverPrimitive.Portal>
);

export { Popover, PopoverContent, PopoverTrigger };
