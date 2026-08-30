"use client";

import { config } from "@config";
import { SectionHeader } from "@home/components/SectionHeader";
import { LocaleLink } from "@i18n/routing";
import { config as paymentsConfig } from "@repo/payments/config";
import type { PaidPlan } from "@repo/payments/types";
import { cn } from "@repo/ui";
import { Button } from "@repo/ui/components/button";
import { Tabs, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { ArrowRightIcon, BadgePercentIcon, CheckIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useMemo, useState } from "react";

export function PricingSection() {
	const t = useTranslations();
	const format = useFormatter();
	const [interval, setBillingInterval] = useState<"month" | "year">("month");

	const signupUrl = useMemo(
		() => config.saasUrl && `${String(config.saasUrl).replace(/\/$/, "")}/signup`,
		[],
	);

	const plans = useMemo(() => {
		const result: Array<{
			id: string;
			title: string;
			description: string;
			features: string[];
			cta: string;
			recommended?: boolean;
			isEnterprise?: boolean;
			prices?: PaidPlan["prices"];
			to: string;
		}> = [];

		if (!paymentsConfig.requireActiveSubscription) {
			result.push({
				id: "free",
				title: t("pricing.products.free.title") ?? "",
				description: t("pricing.products.free.description") ?? "",
				features: Object.values(
					(t.raw("pricing.products.free.features") as Record<string, string>) ?? {},
				),
				cta: t("pricing.getStarted") ?? "",
				to: signupUrl ?? "#",
			});
		}

		for (const [planId, plan] of Object.entries(paymentsConfig.plans)) {
			const isEnterprise = "isEnterprise" in plan;
			const prices = "prices" in plan ? (plan as PaidPlan).prices : undefined;

			result.push({
				id: planId,
				title: t(`pricing.products.${planId}.title`) ?? "",
				description: t(`pricing.products.${planId}.description`) ?? "",
				features: Object.values(
					(t.raw(`pricing.products.${planId}.features`) as Record<string, string>) ?? {},
				),
				cta: isEnterprise ? (t("pricing.contactSales") ?? "") : (t("pricing.getStarted") ?? ""),
				recommended: plan.recommended,
				isEnterprise,
				prices,
				to: signupUrl ?? "#",
			});
		}

		return result;
	}, [t, signupUrl]);

	const hasSubscriptions = plans.some((plan) =>
		plan.prices?.some((price) => price.type === "subscription"),
	);

	return (
		<section id="pricing" className="scroll-mt-16 py-24 lg:py-32 border-y border-border/60">
			<div className="container">
				<SectionHeader
					eyebrow={t("pricing.badge")}
					title={t("pricing.title")}
					description={t("pricing.description")}
				/>

				<div className="@container">
					{hasSubscriptions && (
						<div className="mb-10">
							<Tabs
								value={interval}
								onValueChange={(value) => setBillingInterval(value as "month" | "year")}
								data-test="price-table-interval-tabs"
							>
								<TabsList className="border-foreground/10">
									<TabsTrigger value="month">{t("pricing.monthly")}</TabsTrigger>
									<TabsTrigger value="year">{t("pricing.yearly")}</TabsTrigger>
								</TabsList>
							</Tabs>
						</div>
					)}
					<div
						className={cn(
							"grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-border/60 bg-border/60",
							plans.length >= 2 && "@xl:grid-cols-2",
							plans.length >= 3 && "@3xl:grid-cols-3",
							plans.length >= 4 && "@4xl:grid-cols-4",
						)}
					>
						{plans.map((plan) => {
							const isFree = !plan.prices && !plan.isEnterprise;
							const price = isFree
								? undefined
								: plan.prices?.find(
										(planPrice) => planPrice.type === "one-time" || planPrice.interval === interval,
									);
							const trialPeriodDays =
								price && "trialPeriodDays" in price && price.trialPeriodDays
									? price.trialPeriodDays
									: undefined;

							return (
								<div
									key={plan.id}
									className={cn(
										"p-8 lg:p-10 relative flex h-full flex-col bg-background",
										plan.recommended && "bg-touch/6",
									)}
									data-test="price-table-plan"
								>
									<div className="mb-8">
										<div className="gap-2 flex items-baseline justify-between">
											<h3 className="my-0 font-medium text-lg tracking-tight">{plan.title}</h3>
											{plan.recommended && (
												<p className="font-medium tracking-wide text-xs text-touch">
													{t("pricing.recommended")}
												</p>
											)}
										</div>

										{isFree && (
											<strong
												className="mt-3 font-medium text-3xl tracking-tight block"
												data-test="price-table-plan-price"
											>
												{format.number(0, {
													style: "currency",
													currency: "USD",
												})}
											</strong>
										)}

										{price && (
											<strong
												className="mt-3 font-medium text-3xl tracking-tight block"
												data-test="price-table-plan-price"
											>
												{format.number(price.amount, {
													style: "currency",
													currency: price.currency,
												})}
												{price.type === "subscription" && (
													<span className="ml-1 font-normal text-sm text-foreground/45">
														/
														{price.interval === "year"
															? t("pricing.year", {
																	count: 1,
																})
															: t("pricing.month", {
																	count: 1,
																})}
													</span>
												)}
											</strong>
										)}

										{plan.description && (
											<p className="mt-2 text-sm leading-relaxed text-foreground/55">
												{plan.description}
											</p>
										)}
									</div>

									<div className="mt-auto">
										{!!plan.features?.length && (
											<ul className="mb-8 gap-3 text-sm grid list-none">
												{plan.features.map((feature) => (
													<li key={feature} className="flex items-start justify-start">
														<CheckIcon className="mt-0.5 mr-2 size-3.5 shrink-0 text-touch" />
														<span className="text-foreground/70">{feature}</span>
													</li>
												))}
											</ul>
										)}

										{trialPeriodDays !== undefined && trialPeriodDays > 0 && (
											<div className="mb-4 font-medium text-sm flex items-center justify-start text-foreground/55">
												<BadgePercentIcon className="mr-2 size-4 text-touch" />
												{t("pricing.trialPeriod", {
													days: trialPeriodDays,
												})}
											</div>
										)}

										{plan.to.startsWith("/") ? (
											<Button
												className="w-full"
												variant={plan.recommended ? "primary" : "outline"}
												render={(props) => (
													<LocaleLink {...props} href={plan.to}>
														{plan.cta}
														<ArrowRightIcon className="ml-2 size-4" />
													</LocaleLink>
												)}
											/>
										) : (
											<Button
												className="w-full"
												variant={plan.recommended ? "primary" : "outline"}
												render={(props) => (
													<a {...props} href={plan.to}>
														{plan.cta}
														<ArrowRightIcon className="ml-2 size-4" />
													</a>
												)}
											/>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			</div>
		</section>
	);
}
