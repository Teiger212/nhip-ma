"use client";

import { LocaleLink, useLocalePathname } from "@i18n/routing";
import { cn } from "@repo/ui";
import type { ReactNode } from "react";

export function SettingsMenu({
	menuItems,
	className,
}: {
	menuItems: {
		title: string;
		avatar: ReactNode;
		items: {
			title: string;
			href: string;
			icon?: ReactNode;
		}[];
	}[];
	className?: string;
}) {
	const pathname = useLocalePathname();

	const isActiveMenuItem = (href: string) => pathname.includes(href);

	// Flatten all items from all menu sections into a single array
	const allItems = menuItems.flatMap((item) => item.items);

	return (
		<div className={cn("relative border-b", className)}>
			<nav className="gap-0 flex">
				{allItems.map((item, index) => {
					const isActive = isActiveMenuItem(item.href);
					return (
						<LocaleLink
							key={index}
							href={item.href}
							className={cn(
								"px-4 py-2 text-sm relative border-b-2 transition-colors",
								isActive
									? "font-semibold border-touch text-touch"
									: "font-medium border-transparent text-foreground/60",
							)}
						>
							{item.title}
						</LocaleLink>
					);
				})}
			</nav>
		</div>
	);
}
