"use client";

import { SectionEyebrow } from "@home/components/SectionHeader";
import { cn } from "@repo/ui";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@repo/ui/components/accordion";
import { useTranslations } from "next-intl";

const FAQ_ITEM_KEYS = ["refundPolicy", "cancelSubscription", "changePlan", "freeTrial"] as const;

export function FaqSection({ className }: { className?: string }) {
	const t = useTranslations();

	const items = FAQ_ITEM_KEYS.map((key) => ({
		question: t(`faq.items.${key}.question`),
		answer: t(`faq.items.${key}.answer`),
	}));

	return (
		<section className={cn("scroll-mt-20 py-24 lg:py-32", className)} id="faq">
			<div className="container">
				<div className="gap-14 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-24 lg:items-start grid grid-cols-1">
					<div>
						<SectionEyebrow>{t("faq.badge")}</SectionEyebrow>
						<h2 className="font-medium text-3xl md:text-4xl lg:text-5xl tracking-tight leading-[1.12] text-pretty text-foreground">
							{t("faq.title")}
						</h2>
						<p className="text-base lg:text-lg mt-5 leading-relaxed text-pretty text-foreground/55">
							{t("faq.description")}
						</p>
					</div>
					<Accordion className="w-full text-left" defaultValue={[]} multiple={false}>
						{items.map((item, index) => (
							<AccordionItem
								key={`faq-item-${index}`}
								value={`item-${index}`}
								className="px-0 border-b border-border/60 shadow-none"
							>
								<AccordionTrigger className="font-medium text-base py-6 text-left hover:no-underline">
									{item.question}
								</AccordionTrigger>
								<AccordionContent>
									<p className="leading-relaxed text-foreground/55">{item.answer}</p>
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
			</div>
		</section>
	);
}
