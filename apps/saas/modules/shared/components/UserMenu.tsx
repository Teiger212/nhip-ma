"use client";

import { useSession } from "@auth/hooks/use-session";
import { config } from "@config";
import { LocaleLink, useLocalePathname } from "@i18n/routing";
import { authClient } from "@repo/auth/client";
import {
	cn,
	ColorModeToggle,
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@repo/ui";
import { UserAvatar } from "@shared/components/UserAvatar";
import { WalkLocaleToggle } from "@shared/components/WalkLocaleToggle";
import {
	BookIcon,
	HomeIcon,
	LanguagesIcon,
	LogOutIcon,
	MoreVerticalIcon,
	SettingsIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import Link from "next/link";

import { useIsMobile } from "../hooks/use-media-query";

export function UserMenu({ showUserName }: { showUserName?: boolean }) {
	const t = useTranslations();
	const { user } = useSession();
	const isMobile = useIsMobile();
	const pathname = useLocalePathname();
	const settingsActive = pathname.startsWith("/settings/");
	const marketingUrl = config.marketingUrl;

	const onLogout = async () => {
		await authClient.signOut({
			fetchOptions: {
				onSuccess: async () => {
					window.location.href = new URL(
						config.redirectAfterLogout,
						window.location.origin,
					).toString();
				},
			},
		});
	};

	if (!user) {
		return null;
	}

	const { name, email, image } = user;
	const dropdownSide = isMobile ? "bottom" : showUserName ? "top" : "right";
	const dropdownAlign = isMobile || !showUserName ? "end" : "start";

	const rowClassName =
		"flex cursor-pointer items-center rounded-md outline-hidden transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-sidebar-ring motion-reduce:transition-none";

	return (
		<DropdownMenu modal={false}>
			{showUserName ? (
				/* Expanded sidebar: the row opens Account settings in the pane; the dots open the menu. */
				<div className="gap-1 flex w-full items-center">
					<LocaleLink
						href="/settings/general"
						prefetch
						aria-current={settingsActive ? "page" : undefined}
						className={cn(
							rowClassName,
							"gap-2 px-2 py-1.5 min-w-0 flex-1 hover:bg-sidebar-accent",
							settingsActive && "bg-sidebar-accent shadow-[inset_2px_0_0_var(--sidebar-primary)]",
						)}
					>
						<UserAvatar name={name ?? ""} avatarUrl={image} />
						<span className="leading-tight min-w-0 text-left">
							<span className="font-medium text-sm block truncate">{name}</span>
							<span className="text-xs block truncate opacity-70">{email}</span>
						</span>
					</LocaleLink>
					<DropdownMenuTrigger
						render={(props) => (
							<button
								{...props}
								type="button"
								className={cn(
									props.className,
									rowClassName,
									"size-8 shrink-0 justify-center hover:bg-sidebar-accent",
								)}
								aria-label="User menu"
							>
								<MoreVerticalIcon className="size-4" />
							</button>
						)}
					/>
				</div>
			) : (
				/* Collapsed rail and mobile header: the avatar opens the menu, which then carries the settings link. */
				<DropdownMenuTrigger
					render={(props) => (
						<button
							{...props}
							type="button"
							className={cn(props.className, rowClassName, "gap-2 hover:bg-sidebar-accent")}
							aria-label="User menu"
						>
							<UserAvatar name={name ?? ""} avatarUrl={image} />
						</button>
					)}
				/>
			)}

			<DropdownMenuContent
				side={dropdownSide}
				align={dropdownAlign}
				className="w-56 min-w-[var(--anchor-width)]"
			>
				<DropdownMenuGroup>
					<DropdownMenuLabel>
						{name}
						<span className="font-normal text-xs block opacity-70">{email}</span>
					</DropdownMenuLabel>
				</DropdownMenuGroup>

				<DropdownMenuSeparator />

				{/* Color mode selection */}
				<DropdownMenuItem
					className="gap-4 flex cursor-default resize-none items-center justify-between hover:cursor-default hover:bg-transparent focus:bg-transparent"
					closeOnClick={false}
				>
					<span className="whitespace-nowrap">{t("app.userMenu.colorMode")}</span>
					<ColorModeToggle
						modes={["system", "light", "dark"]}
						labels={{
							system: t("common.colorMode.system"),
							light: t("common.colorMode.light"),
							dark: t("common.colorMode.dark"),
						}}
					/>
				</DropdownMenuItem>

				<DropdownMenuSeparator />

				{!showUserName ? (
					<DropdownMenuItem
						nativeButton={false}
						render={(props) => (
							<LocaleLink
								{...props}
								href="/settings/general"
								className={cn(props.className, "flex items-center")}
							>
								<SettingsIcon className="mr-2 size-4" />
								{t("app.userMenu.accountSettings")}
							</LocaleLink>
						)}
					/>
				) : null}

				<DropdownMenuItem
					className="gap-4 flex cursor-default resize-none items-center justify-between hover:cursor-default hover:bg-transparent focus:bg-transparent"
					closeOnClick={false}
				>
					<span className="flex items-center">
						<LanguagesIcon className="mr-2 size-4" />
						<span className="whitespace-nowrap">{t("app.userMenu.language")}</span>
					</span>
					<WalkLocaleToggle />
				</DropdownMenuItem>

				{config.docsUrl && (
					<DropdownMenuItem
						nativeButton={false}
						render={(props) => (
							<a
								{...props}
								href={config.docsUrl}
								className={cn(props.className, "flex items-center")}
							>
								<BookIcon className="mr-2 size-4" />
								{t("app.userMenu.documentation")}
							</a>
						)}
					/>
				)}

				{marketingUrl && (
					<DropdownMenuItem
						nativeButton={false}
						render={(props) => (
							<Link
								{...props}
								href={marketingUrl}
								className={cn(props.className, "flex items-center")}
							>
								<HomeIcon className="mr-2 size-4" />
								{t("app.userMenu.home")}
							</Link>
						)}
					/>
				)}

				<DropdownMenuItem onClick={onLogout}>
					<LogOutIcon className="mr-2 size-4" />
					{t("app.userMenu.logout")}
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
