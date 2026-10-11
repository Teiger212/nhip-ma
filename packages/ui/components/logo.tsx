import { cn } from "../lib";

export function Logo({ withLabel = true, className }: { className?: string; withLabel?: boolean }) {
	return (
		<span className={cn("gap-2.5 flex items-center leading-none text-foreground", className)}>
			<svg className="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden={withLabel}>
				<title>Nhịp</title>
				<rect x="11.5" y="5.25" width="9" height="4.5" rx="2.25" fill="currentColor" />
				<rect
					x="8"
					y="13.75"
					width="16"
					height="4.5"
					rx="2.25"
					fill="var(--touch)"
					className="fill-touch"
				/>
				<rect x="4.5" y="22.25" width="23" height="4.5" rx="2.25" fill="currentColor" />
			</svg>
			{withLabel && (
				<span className="font-semibold tracking-tight max-md:sr-only md:block text-base">Nhịp</span>
			)}
		</span>
	);
}

/**
 * Nhịp's wordmark (DESIGN.md, #314): the pulse, then "Nhịp" in extra-bold ink with the nặng
 * dot under the i drawn as a 5px disc, so it reads at 1x where the font's own mark would blur
 * into the baseline. Screen readers get the name as written; the drawn letters are hidden.
 */
export function Wordmark({
	className,
	label = "Nhịp",
	showText = true,
	fadeInSidebarStrip = false,
}: {
	className?: string;
	/** The product name as written, for screen readers. */
	label?: string;
	/** False for the pulse alone (the collapsed sidebar). */
	showText?: boolean;
	/** In the sidebar: the letters fade as it collapses to its icon strip (#234). */
	fadeInSidebarStrip?: boolean;
}) {
	return (
		<span className={cn("gap-2 flex items-center leading-none text-foreground", className)}>
			<svg
				className="size-5.5 shrink-0"
				viewBox="0 0 24 24"
				fill="none"
				stroke="currentColor"
				strokeWidth={2}
				strokeLinecap="round"
				strokeLinejoin="round"
				aria-hidden="true"
			>
				<path d="M2.5 12.5h4l2.2-5.5 3.6 11 2.6-8 1.6 2.5h5" />
			</svg>
			<span className="sr-only">{label}</span>
			{showText ? (
				<span
					aria-hidden="true"
					className={cn(
						"text-2xl font-extrabold tracking-tight pb-1 leading-none whitespace-nowrap",
						fadeInSidebarStrip &&
							"min-w-0 ease-out transition-opacity duration-220 group-data-[collapsible=icon]:opacity-0 motion-reduce:transition-none",
					)}
				>
					Nh
					<span className="after:size-1.25 relative inline-block after:absolute after:top-[calc(100%-2px)] after:left-1/2 after:-translate-x-1/2 after:rounded-full after:bg-current after:content-['']">
						i
					</span>
					p
				</span>
			) : null}
		</span>
	);
}
