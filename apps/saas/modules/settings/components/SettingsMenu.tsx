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

	// The same underline tabs as `@repo/ui` Tabs (People's Joined / Pending invitations): a hairline
	// under the row, the active page in ink over a 2px Touch Blue line. The row scrolls on a phone
	// rather than wrapping.
	return (
		<div className={cn("relative border-b", className)}>
			<nav className="gap-0 flex overflow-x-auto">
				{allItems.map((item, index) => {
					const isActive = isActiveMenuItem(item.href);
					return (
						<LocaleLink
							key={index}
							href={item.href}
							aria-current={isActive ? "page" : undefined}
							className={cn(
								"px-3 py-2 font-medium text-sm relative shrink-0 border-b-2 whitespace-nowrap transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset",
								isActive
									? "border-touch text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
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
