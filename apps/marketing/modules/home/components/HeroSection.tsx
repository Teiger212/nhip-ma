"use client";

import { config } from "@config";
import { HeroWireframe } from "@home/components/HeroWireframe";
import { Button } from "@repo/ui/components/button";
import { ArrowRightIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function HeroSection() {
	const t = useTranslations();

	return (
		<section className="max-w-full">
			<div className="pt-20 pb-10 md:pt-24 md:pb-12 lg:pt-28 lg:pb-14 container overflow-x-hidden">
				<div className="max-w-5xl">
					<p className="mb-6 gap-2.5 font-medium text-sm tracking-wide flex flex-wrap items-center text-foreground/50">
						<span className="px-2 py-0.5 font-semibold tracking-wide text-xs rounded-full bg-touch text-touch-foreground">
							{t("home.hero.new")}
						</span>
						{t("home.hero.featureBadge")}
					</p>

					<h1 className="font-medium text-4xl sm:text-5xl lg:text-6xl xl:text-7xl tracking-tight leading-[1.05] text-pretty text-foreground">
						{t("home.hero.title")}
					</h1>

					<p className="mt-6 text-base sm:text-lg max-w-xl leading-relaxed text-pretty text-foreground/55">
						{t("home.hero.subtitle")}
					</p>

					<div className="mt-8 gap-3 flex flex-wrap items-center">
						<Button
							size="lg"
							variant="primary"
							render={(props) => (
								<a {...props} href={config.saasUrl}>
									{t("home.hero.getStarted")}
									<ArrowRightIcon className="ml-2 size-4" />
								</a>
							)}
						/>
						{config.docsUrl && (
							<Button
								variant="ghost"
								size="lg"
								className="text-touch hover:bg-touch/10 hover:text-touch"
								render={(props) => (
									<a {...props} href={config.docsUrl}>
										{t("home.hero.documentation")}
									</a>
								)}
							/>
						)}
					</div>
				</div>
			</div>

			<div className="pb-16 md:pb-20 lg:pb-24 container">
				<HeroWireframe />
			</div>
		</section>
	);
}
