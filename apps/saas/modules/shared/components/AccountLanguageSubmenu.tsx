"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { cn, SidebarMenuSubItem } from "@repo/ui";
import { isWalkLocale, walkLocaleOptions } from "@shared/lib/walk-locales";
import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";

export function AccountLanguageSubmenu({ label }: { label: string }) {
	const router = useRouter();
	const currentLocale = useLocale();
	const value = isWalkLocale(currentLocale) ? currentLocale : "en";

	return (
		<>
			<SidebarMenuSubItem>
				<p className="px-2 pt-1 text-xs text-sidebar-foreground/70">{label}</p>
			</SidebarMenuSubItem>
			{walkLocaleOptions.map((locale) => {
				const selected = value === locale.value;

				return (
					<SidebarMenuSubItem key={locale.value}>
						<button
							type="button"
							aria-label={`${label}: ${locale.label}`}
							aria-pressed={selected}
							className={cn(
								"min-h-11 h-11 gap-2 px-2 text-sm flex w-full items-center rounded-md text-left text-sidebar-foreground outline-hidden",
								"hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
								"focus-visible:ring-2 focus-visible:ring-sidebar-ring",
								selected && "font-medium bg-sidebar-accent text-sidebar-accent-foreground",
							)}
							onClick={async () => {
								if (!isWalkLocale(locale.value) || locale.value === value) {
									return;
								}

								await updateLocale(locale.value);
								router.refresh();
							}}
						>
							<span>{locale.label}</span>
						</button>
					</SidebarMenuSubItem>
				);
			})}
		</>
	);
}
