"use client";

import { FeaturePreview } from "@home/components/FeaturePreview";
import { SectionHeader } from "@home/components/SectionHeader";
import { cn } from "@repo/ui";
import {
	ArrowLeftRightIcon,
	CreditCardIcon,
	ShieldCheckIcon,
	TimerIcon,
	UserPlusIcon,
	WalletIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { ComponentType, ReactNode, SVGProps } from "react";

interface FeatureHighlight {
	title: string;
	description: string;
	icon: ComponentType<SVGProps<SVGSVGElement>>;
}

interface FeatureItem {
	id: string;
	title: string;
	subtitle?: string;
	description?: ReactNode;
	preview: "teams" | "billing";
	highlights?: FeatureHighlight[];
}

export function FeaturesSection() {
	const t = useTranslations();

	const featureItems: FeatureItem[] = [
		{
			id: "feature1",
			title: t("home.features.feature1.title"),
			subtitle: t("home.features.feature1.subtitle"),
			description: t("home.features.feature1.description"),
			preview: "teams",
			highlights: [
				{
					title: t("home.features.feature1.benefit1.title"),
					description: t("home.features.feature1.benefit1.description"),
					icon: ShieldCheckIcon,
				},
				{
					title: t("home.features.feature1.benefit2.title"),
					description: t("home.features.feature1.benefit2.description"),
					icon: UserPlusIcon,
				},
				{
					title: t("home.features.feature1.benefit3.title"),
					description: t("home.features.feature1.benefit3.description"),
					icon: ArrowLeftRightIcon,
				},
			],
		},
		{
			id: "feature2",
			title: t("home.features.feature2.title"),
			subtitle: t("home.features.feature2.subtitle"),
			description: t("home.features.feature2.description"),
			preview: "billing",
			highlights: [
				{
					title: t("home.features.feature2.benefit1.title"),
					description: t("home.features.feature2.benefit1.description"),
					icon: CreditCardIcon,
				},
				{
					title: t("home.features.feature2.benefit2.title"),
					description: t("home.features.feature2.benefit2.description"),
					icon: TimerIcon,
				},
				{
					title: t("home.features.feature2.benefit3.title"),
					description: t("home.features.feature2.benefit3.description"),
					icon: WalletIcon,
				},
			],
		},
	];

	return (
		<section id="features" className="scroll-my-20 py-24 lg:py-32">
			<div className="container">
				<SectionHeader
					eyebrow={t("home.features.badge")}
					title={t("home.features.title")}
					description={t("home.features.description")}
				/>

				<div className="gap-24 lg:gap-32 flex flex-col">
					{featureItems.map((item, index) => {
						const filteredHighlights = item.highlights || [];
						const isReversed = index % 2 === 1;
						return (
							<div key={item.id}>
								<div className="gap-12 lg:grid-cols-2 lg:gap-20 grid grid-cols-1 items-center">
									<div className={cn({ "lg:order-2": isReversed })}>
										<FeaturePreview variant={item.preview} />
									</div>

									<div className={cn({ "lg:order-1": isReversed })}>
										<h3 className="font-medium text-2xl lg:text-3xl tracking-tight text-pretty text-foreground">
											{item.title}
										</h3>
										{item.subtitle ? (
											<p className="mt-4 text-base leading-relaxed text-pretty text-foreground/70">
												{item.subtitle}
											</p>
										) : null}
										{item.description && (
											<p className="mt-3 text-sm leading-relaxed text-foreground/50">
												{item.description}
											</p>
										)}
									</div>
								</div>

								{filteredHighlights.length > 0 && (
									<div className="mt-12 gap-x-10 gap-y-10 sm:grid-cols-3 lg:mt-16 grid">
										{filteredHighlights.map((highlight) => (
											<div key={highlight.title} className="flex flex-col items-start">
												<highlight.icon className="mb-4 size-6 text-touch" />
												<strong className="font-medium text-sm block">{highlight.title}</strong>
												<p className="mt-2 text-sm leading-relaxed text-foreground/50">
													{highlight.description}
												</p>
											</div>
										))}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
		</section>
	);
}
