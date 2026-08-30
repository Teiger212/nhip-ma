"use client";

import { config } from "@config";
import { SectionHeader } from "@home/components/SectionHeader";
import { LocaleLink } from "@i18n/routing";
import { Button } from "@repo/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";

export function CtaSection() {
	const t = useTranslations();

	const signupUrl = useMemo(
		() => config.saasUrl && `${String(config.saasUrl).replace(/\/$/, "")}/signup`,
		[],
	);

	return (
		<section id="cta" className="scroll-mt-20 py-24 lg:py-36 border-t border-border/60">
			<div className="container">
				<SectionHeader
					align="center"
					className="mb-0 lg:mb-0"
					eyebrow={t("home.cta.badge")}
					title={t("home.cta.title")}
					description={t("home.cta.description")}
				/>

				<div className="mt-10 gap-3 flex flex-wrap items-center justify-center">
					{signupUrl && (
						<Button
							size="lg"
							variant="primary"
							render={(props) => (
								<a {...props} href={signupUrl}>
									{t("home.cta.primary")}
									<ArrowRightIcon className="ml-2 size-4" />
								</a>
							)}
						/>
					)}
					<Button
						size="lg"
						variant="ghost"
						className="text-touch hover:bg-touch/10 hover:text-touch"
						render={(props) => (
							<LocaleLink {...props} href="/contact">
								{t("home.cta.secondary")}
							</LocaleLink>
						)}
					/>
				</div>
			</div>
		</section>
	);
}
