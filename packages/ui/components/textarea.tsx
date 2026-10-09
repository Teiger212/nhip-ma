import * as React from "react";

import { cn } from "../lib";

/**
 * `growOnPhone`: below `md` the box grows with its text (CSS `field-sizing`), up to whatever
 * `max-h-*` the caller sets, then scrolls; from `md` it keeps its height (#94, the reply box).
 */
const Textarea = ({
	className,
	growOnPhone = false,
	...props
}: React.ComponentProps<"textarea"> & { growOnPhone?: boolean }) => {
	return (
		<textarea
			className={cn(
				"shadow-xs px-3 py-2 text-base md:text-sm flex min-h-[80px] w-full rounded-xl border border-input bg-card placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
				growOnPhone && "max-md:field-sizing-content",
				className,
			)}
			{...props}
		/>
	);
};

export { Textarea };
