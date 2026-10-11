import { cn } from "@repo/ui";
import type { ReactNode } from "react";

import type { DurationPart } from "../lib/duration";

/**
 * Home's pieces that carry no state (#314): a figure (extra-bold tabular digits, any unit
 * beside them at the body size in Slate), a share bar on a hairline track, and a panel's
 * title row.
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
				"font-extrabold text-figure-sm md:text-figure tabular-nums",
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
						className="text-sm font-semibold tracking-normal whitespace-pre text-muted-foreground"
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

/** Each bar's fill: navy under a funnel figure; Signal Blue strong or soft for the buckets. */
const BAR_TONE = {
	ink: "fill-foreground",
	strong: "fill-chart-strong",
	soft: "fill-chart-soft",
} as const;

/**
 * A share of the whole as a bar on its hairline track, drawn in SVG so the width is an
 * attribute. `thin` under a funnel figure, in navy; `thick` for a response-time bucket, `strong`
 * for the one to read first and `soft` for the rest.
 */
export function ShareBar({
	share,
	size = "thin",
	tone = "ink",
}: {
	share: number;
	size?: "thin" | "thick";
	tone?: keyof typeof BAR_TONE;
}) {
	const width = `${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`;
	return (
		<svg
			aria-hidden="true"
			className={cn(
				"block w-full overflow-hidden",
				size === "thin" ? "h-1 rounded-xs" : "h-2.5 rounded-xs",
			)}
		>
			<rect width="100%" height="100%" className="fill-chart-track" />
			<rect width={width} height="100%" rx="2" className={BAR_TONE[tone]} />
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
		<div className="gap-3 px-5 pt-4 min-h-12 flex items-center">
			<h3 id={id} className="text-base font-extrabold tracking-tight">
				{children}
			</h3>
			{meta ? (
				<div className="text-note font-medium min-w-0 ml-auto truncate text-muted-foreground">
					{meta}
				</div>
			) : null}
		</div>
	);
}
