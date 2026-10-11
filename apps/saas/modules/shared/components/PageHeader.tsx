"use client";

import { cn } from "@repo/ui";
import type { ReactNode } from "react";

export function PageHeader({
	title,
	subtitle,
	aside,
	className,
}: {
	title: string;
	subtitle?: string;
	/** Something that qualifies the whole page, such as Home's window; sits to the right. */
	aside?: ReactNode;
	className?: string;
}) {
	return (
		<div className={cn("mb-6 gap-4 flex items-end justify-between", className)}>
			<div className="min-w-0">
				<h1 className="font-extrabold text-2xl tracking-tight md:text-3xl font-heading text-balance">
					{title}
				</h1>
				{subtitle ? (
					<p className="mt-1 text-sm font-medium text-pretty text-muted-foreground">{subtitle}</p>
				) : null}
			</div>
			{aside ? <div className="shrink-0">{aside}</div> : null}
		</div>
	);
}
