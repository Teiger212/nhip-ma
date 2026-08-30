import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui";
import { ArrowLeftIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

export async function generateMetadata() {
	const t = await getTranslations("notFound");

	return {
		title: t("title"),
	};
}

export default async function NotFoundPage() {
	const t = await getTranslations("notFound");

	return (
		<div className="px-6 flex min-h-[60vh] flex-col items-center justify-center text-center">
			<p className="font-medium text-sm tracking-wide text-foreground/45">{t("code")}</p>
			<h1 className="mt-2 font-medium text-3xl md:text-4xl tracking-tight text-balance">
				{t("title")}
			</h1>

			<Button
				className="mt-6"
				variant="secondary"
				render={(props) => (
					<LocaleLink {...props} href="/">
						<ArrowLeftIcon className="mr-2 size-4" /> {t("goToHomepage")}
					</LocaleLink>
				)}
			/>
		</div>
	);
}
