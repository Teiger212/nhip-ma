"use client";

import { cn } from "@repo/ui";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";

import { SidebarProvider, useSidebar } from "../lib/sidebar-context";
import { NavBar } from "./NavBar";

function isInboxPath(pathname: string): boolean {
	return pathname === "/inbox" || pathname.startsWith("/inbox/");
}

function AppContent({ children }: PropsWithChildren) {
	const { isCollapsed } = useSidebar();
	const flush = isInboxPath(usePathname());

	return (
		<div
			className={cn(
				"bg-background",
				flush
					? "md:h-screen flex h-svh flex-col overflow-hidden"
					: "md:h-screen md:overflow-hidden",
			)}
		>
			<NavBar />
			<div
				className={cn(flush ? "min-h-0 flex-1" : "h-screen", "flex", {
					"md:ml-[280px]": !isCollapsed,
					"md:ml-[80px]": isCollapsed,
				})}
			>
				<main
					className={cn(
						"md:border-l md:border-t-0 h-full w-full border-t",
						flush ? "min-h-0 p-0 overflow-hidden" : "py-4 md:overflow-y-auto",
					)}
				>
					{flush ? children : <div className="container">{children}</div>}
				</main>
			</div>
		</div>
	);
}

export function AppWrapper({ children }: PropsWithChildren) {
	return (
		<SidebarProvider>
			<AppContent>{children}</AppContent>
		</SidebarProvider>
	);
}
