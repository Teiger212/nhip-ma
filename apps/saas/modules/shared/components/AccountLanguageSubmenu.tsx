"use client";

import { updateLocale } from "@i18n/lib/update-locale";
import { SidebarMenuSubButton, SidebarMenuSubItem } from "@repo/ui";
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
			{walkLocaleOptions.map((locale) => (
				<SidebarMenuSubItem key={locale.value}>
					<SidebarMenuSubButton
						isActive={value === locale.value}
						className="min-h-11 h-11"
						render={(props) => (
							<button
								type="button"
								className={props.className}
								data-slot={props["data-slot"]}
								data-sidebar={props["data-sidebar"]}
								data-size={props["data-size"]}
								data-active={props["data-active"]}
								aria-label={`${label}: ${locale.label}`}
								aria-pressed={value === locale.value}
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
						)}
					/>
				</SidebarMenuSubItem>
			))}
		</>
	);
}
