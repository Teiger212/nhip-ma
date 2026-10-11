import * as React from "react";

import { cn } from "../lib";

/** A fixed-height box with no resize handle; text longer than the box scrolls inside it (#312). */
const Textarea = ({ className, ...props }: React.ComponentProps<"textarea">) => {
	return (
		<textarea
			className={cn(
				"shadow-xs px-3 py-2 text-base md:text-sm flex min-h-[80px] w-full resize-none rounded-xl border border-input bg-card placeholder:text-muted-foreground focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
};

export { Textarea };
