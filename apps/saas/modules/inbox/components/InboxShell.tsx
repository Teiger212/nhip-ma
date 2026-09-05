"use client";

import { Button, cn } from "@repo/ui";
import { BarChart3Icon, GlobeIcon, InboxIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { InboxLocaleSwitch } from "./InboxLocaleSwitch";

export function InboxShell({ children }: { children: ReactNode }) {
	const t = useTranslations("inbox");

	return (
		<div className="flex min-h-svh w-full">
			<aside className="w-56 md:flex hidden h-svh shrink-0 flex-col border-r border-border bg-muted/30 text-foreground">
				<div className="h-12 px-3 flex shrink-0 items-center border-b">
					<span className="text-sm font-medium">{t("brand")}</span>
				</div>
				<div className="min-h-0 p-2 flex flex-1 flex-col">
					<ul className="gap-1 flex w-full flex-col">
						<li>
							<Button
								type="button"
								variant="ghost"
								className={cn(
									"h-8 gap-2 px-2 text-sm font-medium w-full justify-start rounded-md",
									"bg-foreground/10",
								)}
								aria-current="page"
							>
								<InboxIcon className="size-4" />
								{t("navItem")}
							</Button>
						</li>
						<li>
							<Button
								type="button"
								variant="ghost"
								disabled
								className="h-8 gap-2 px-2 text-sm font-medium w-full justify-start rounded-md"
							>
								<BarChart3Icon className="size-4" />
								{t("navReports")}
							</Button>
						</li>
						<li>
							<Button
								type="button"
								variant="ghost"
								disabled
								className="h-8 gap-2 px-2 text-sm font-medium w-full justify-start rounded-md"
							>
								<GlobeIcon className="size-4" />
								{t("navInternational")}
							</Button>
						</li>
					</ul>
				</div>
				<div className="shrink-0 border-t">
					<div className="p-2 flex items-center">
						<InboxLocaleSwitch />
					</div>
					<div className="px-3 py-2 text-xs border-t text-muted-foreground">{t("footer")}</div>
				</div>
			</aside>
			<main className="min-h-0 min-w-0 relative flex flex-1 flex-col bg-background">
				{children}
			</main>
		</div>
	);
}
