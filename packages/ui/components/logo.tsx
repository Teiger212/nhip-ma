import { cn } from "../lib";

export function Logo({ withLabel = true, className }: { className?: string; withLabel?: boolean }) {
	return (
		<span className={cn("gap-2.5 flex items-center leading-none text-foreground", className)}>
			<svg className="size-7 shrink-0" viewBox="0 0 32 32" aria-hidden={withLabel}>
				<title>Acme</title>
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
				<span className="font-semibold tracking-tight max-md:sr-only md:block text-[1.05rem]">
					Acme
				</span>
			)}
		</span>
	);
}
