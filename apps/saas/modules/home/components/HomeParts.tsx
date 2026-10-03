import { cn } from "@repo/ui";
import type { ReactNode } from "react";

import type { DurationPart } from "../lib/duration";

/**
 * Home's pieces that carry no state: a figure (light Plex Mono for the digits, the sans
 * for any unit beside them), a share bar, and a panel's title row.
 */

export function Figure({
	parts,
	muted = false,
	className,
}: {
	parts: DurationPart[];
	muted?: boolean;
	className?: string;
}) {
	return (
		<p
			className={cn(
				"font-mono font-light text-figure-sm md:text-figure tabular-nums",
				muted ? "text-muted-foreground/50" : "text-foreground",
				className,
			)}
		>
			{parts.map((part, index) =>
				part.number ? (
					<span key={index}>{part.value}</span>
				) : (
					<span
						key={index}
						className="font-sans text-sm font-normal tracking-normal whitespace-pre text-muted-foreground"
					>
						{part.value}
					</span>
				),
			)}
		</p>
	);
}

export function count(value: number): DurationPart[] {
	return [{ value: String(value), number: true }];
}

/**
 * A share of the whole as a bar on its track, drawn in SVG so the width is an attribute.
 * `thin` under a funnel figure, `thick` for a response-time bucket; `soft` for every bar
 * that is not the one to read first.
 */
export function ShareBar({
	share,
	size = "thin",
	tone = "strong",
}: {
	share: number;
	size?: "thin" | "thick";
	tone?: "strong" | "soft";
}) {
	const width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
	return (
		<svg
			aria-hidden="true"
			className={cn(
				"block w-full overflow-hidden",
				size === "thin" ? "h-1 rounded-full" : "h-3.5 rounded-sm",
			)}
		>
			<rect width="100%" height="100%" className="fill-chart-track" />
			<rect
				width={width}
				height="100%"
				rx="2"
				className={tone === "strong" ? "fill-chart-strong" : "fill-chart-soft"}
			/>
		</svg>
	);
}

export function PanelTitle({
	id,
	children,
	meta,
}: {
	id: string;
	children: ReactNode;
	meta?: ReactNode;
}) {
	return (
		<div className="gap-3 px-5 pt-4 flex items-baseline">
			<h3 id={id} className="font-semibold text-sm md:text-base tracking-tight font-heading">
				{children}
			</h3>
			{meta ? (
				<div className="text-xs min-w-0 ml-auto truncate text-muted-foreground">{meta}</div>
			) : null}
		</div>
	);
}
