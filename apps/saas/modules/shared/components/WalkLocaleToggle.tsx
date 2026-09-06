"use client";

import { useSwitchLocale } from "@i18n/lib/use-switch-locale";
import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui";
import { isWalkLocale, resolveWalkLocale, walkLocaleOptions } from "@shared/lib/walk-locales";
import { useLocale } from "next-intl";

export function WalkLocaleToggle({ className }: { className?: string }) {
	const switchLocale = useSwitchLocale();
	const value = resolveWalkLocale(useLocale());
	const activeIndex = Math.max(
		0,
		walkLocaleOptions.findIndex((locale) => locale.value === value),
	);

	return (
		<TooltipProvider delay={0}>
			<div
				className={cn(
					"gap-0 p-0.5 relative inline-flex cursor-pointer resize-none items-center rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)] hover:cursor-pointer",
					className,
				)}
				data-test="walk-locale-toggle"
			>
				<div
					className="left-0.5 top-0.5 h-7 w-8 ease-out shadow-xs absolute rounded-full border border-border bg-background transition-transform duration-200 motion-reduce:transition-none"
					style={{
						transform: `translateX(${activeIndex * 100}%)`,
					}}
					aria-hidden="true"
				/>
				{walkLocaleOptions.map((locale) => {
					const isActive = locale.value === value;

					return (
						<Tooltip key={locale.value}>
							<TooltipTrigger
								render={(props) => (
									<button
										{...props}
										type="button"
										onClick={(event) => {
											props.onClick?.(event);

											if (!isWalkLocale(locale.value) || locale.value === value) {
												return;
											}

											void switchLocale(locale.value);
										}}
										className={cn(
											props.className,
											"h-7 w-8 text-xs font-semibold relative z-10 flex cursor-pointer resize-none items-center justify-center rounded-full transition-colors hover:cursor-pointer",
											"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
											isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
										)}
										data-test={`walk-locale-toggle-item-${locale.value}`}
										aria-label={locale.label}
										aria-pressed={isActive}
									>
										{locale.code}
									</button>
								)}
							/>
							<TooltipContent>{locale.label}</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
}
