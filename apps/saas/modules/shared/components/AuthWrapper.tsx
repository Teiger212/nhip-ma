import { config } from "@config";
import { cn, ColorModeToggle, Logo } from "@repo/ui";
import { getTranslations } from "next-intl/server";
import type { PropsWithChildren } from "react";

import { Footer } from "./Footer";
import { LocaleSwitch } from "./LocaleSwitch";

export async function AuthWrapper({
	children,
	contentClass,
}: PropsWithChildren<{ contentClass?: string }>) {
	const t = await getTranslations();

	return (
		<div className="py-6 flex min-h-screen w-full">
			<div className="gap-8 flex w-full flex-col items-center justify-between">
				<div className="container">
					<div className="flex items-center justify-between">
						<a href={config.marketingUrl ?? "/"} className="block">
							<Logo withLabel={false} />
						</a>

						<div className="gap-2 flex items-center justify-end">
							<LocaleSwitch />
							<ColorModeToggle
								modes={["system", "light", "dark"]}
								labels={{
									system: t("common.colorMode.system"),
									light: t("common.colorMode.light"),
									dark: t("common.colorMode.dark"),
								}}
							/>
						</div>
					</div>
				</div>

				<div className="container flex justify-center">
					<main className={cn("max-w-md w-full", contentClass)}>{children}</main>
				</div>

				<Footer />
			</div>
		</div>
	);
}
