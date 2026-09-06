"use client";

import { cn, Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@repo/ui";
import { type InboxStyle, inboxStyles, resolveInboxStyle } from "@shared/lib/inbox-style";
import { updateInboxStyle } from "@shared/lib/update-inbox-style";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

export function InboxStyleToggle({ className }: { className?: string }) {
	const t = useTranslations("common.inboxStyle");
	const router = useRouter();
	const [pending, startTransition] = useTransition();
	// The active style is stamped on <html data-style> by the locale layout.
	const [value, setValue] = useState<InboxStyle>("olive");
	useEffect(() => {
		setValue(resolveInboxStyle(document.documentElement.dataset.style));
	}, []);
	const activeIndex = Math.max(0, inboxStyles.indexOf(value));

	return (
		<TooltipProvider delay={0}>
			<div
				className={cn(
					"gap-0 p-0.5 relative inline-flex cursor-pointer resize-none items-center rounded-full bg-muted shadow-[inset_0_0_0_1px_var(--border)] hover:cursor-pointer",
					pending && "opacity-70",
					className,
				)}
				data-test="inbox-style-toggle"
			>
				<div
					className="left-0.5 top-0.5 h-7 w-9 ease-out shadow-xs absolute rounded-full border border-border bg-background transition-transform duration-200 motion-reduce:transition-none"
					style={{ transform: `translateX(${activeIndex * 100}%)` }}
					aria-hidden="true"
				/>
				{inboxStyles.map((style) => {
					const isActive = style === value;
					return (
						<Tooltip key={style}>
							<TooltipTrigger
								render={(props) => (
									<button
										{...props}
										type="button"
										onClick={(event) => {
											props.onClick?.(event);
											if (isActive) {
												return;
											}
											setValue(style);
											startTransition(async () => {
												await updateInboxStyle(style);
												router.refresh();
											});
										}}
										className={cn(
											props.className,
											"h-7 w-9 font-semibold relative z-10 flex cursor-pointer resize-none items-center justify-center rounded-full text-[11px] transition-colors hover:cursor-pointer",
											"focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none",
											isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
										)}
										data-test={`inbox-style-toggle-item-${style}`}
										aria-label={t(style)}
										aria-pressed={isActive}
									>
										{t(`${style}Short`)}
									</button>
								)}
							/>
							<TooltipContent>{t(style)}</TooltipContent>
						</Tooltip>
					);
				})}
			</div>
		</TooltipProvider>
	);
}
