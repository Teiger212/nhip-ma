import { config } from "@config";
import { LocaleLink } from "@i18n/routing";
import { Logo } from "@repo/ui";
import { useTranslations } from "next-intl";

export function Footer() {
	const t = useTranslations();

	return (
		<footer className="py-16 lg:py-20 text-sm border-t border-border/60 text-foreground/45">
			<div className="gap-8 sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr] sm:gap-10 container grid grid-cols-1 items-start">
				<div>
					<Logo className="font-heading opacity-70" />
					<p className="mt-4 max-w-xs text-sm leading-relaxed">
						© {new Date().getFullYear()} {config.appName}.{" "}
						<a href="https://supastarter.dev" className="transition-colors hover:text-touch">
							{t("common.footer.builtWith")}
						</a>
						.
					</p>
				</div>

				<div className="gap-2.5 flex flex-col">
					<LocaleLink href="/blog" className="block transition-colors hover:text-touch">
						{t("common.footer.blog")}
					</LocaleLink>

					<LocaleLink href="/#features" className="block transition-colors hover:text-touch">
						{t("common.footer.features")}
					</LocaleLink>

					<LocaleLink href="/#pricing" className="block transition-colors hover:text-touch">
						{t("common.footer.pricing")}
					</LocaleLink>
				</div>

				<div className="gap-2.5 flex flex-col">
					<LocaleLink
						href="/legal/privacy-policy"
						className="block transition-colors hover:text-touch"
					>
						{t("common.footer.privacyPolicy")}
					</LocaleLink>

					<LocaleLink href="/legal/terms" className="block transition-colors hover:text-touch">
						{t("common.footer.termsAndConditions")}
					</LocaleLink>
				</div>
			</div>
		</footer>
	);
}
