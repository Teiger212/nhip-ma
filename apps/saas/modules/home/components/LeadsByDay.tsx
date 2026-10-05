"use client";

import { Card } from "@repo/ui";
import {
	type ChartConfig,
	ChartContainer,
	ChartTooltip,
	ChartTooltipContent,
} from "@repo/ui/components/chart";
import { useLocale, useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import { PanelTitle } from "./HomeParts";

type Day = { day: string; leads: number };

/** Every seventh day back from today gets a date under the axis. */
const LABEL_EVERY = 7;

/** The top of the scale: even, so the middle gridline lands on a whole number. */
function scaleMax(days: Day[]): number {
	const most = Math.max(0, ...days.map((day) => day.leads));
	return Math.max(2, Math.ceil(most / 2) * 2);
}

function dayDate(day: string): Date {
	return new Date(`${day}T00:00:00Z`);
}

/**
 * Leads by day over Home's window, in the office's local days (ADR 0002): one bar per
 * day in the soft blue, today in the strong one.
 */
export function LeadsByDay({ days, total }: { days: Day[]; total: number }) {
	const t = useTranslations("home");
	const locale = useLocale();
	const config = {
		leads: { label: t("funnel.leadsIn"), color: "var(--chart-soft)" },
	} satisfies ChartConfig;
	const short = new Intl.DateTimeFormat(locale, {
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	const long = new Intl.DateTimeFormat(locale, {
		weekday: "short",
		day: "numeric",
		month: "short",
		timeZone: "UTC",
	});
	const average = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(
		total / Math.max(1, days.length),
	);
	const max = scaleMax(days);
	const last = days.length - 1;
	const ticks = days.filter((_, index) => (last - index) % LABEL_EVERY === 0).map((day) => day.day);

	return (
		<Card className="flex flex-col" aria-labelledby="home-leads-by-day">
			<PanelTitle id="home-leads-by-day" meta={t("perDay", { total, average })}>
				{t("leadsByDay")}
			</PanelTitle>
			<div className="px-3 pt-3 pb-2 relative flex flex-1 flex-col">
				<ChartContainer
					config={config}
					className="min-h-44 md:min-h-56 aspect-auto w-full flex-1"
					aria-label={t("chartLabel", { days: days.length, total })}
				>
					<BarChart data={days} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
						<CartesianGrid vertical={false} />
						<YAxis
							width={24}
							domain={[0, max]}
							ticks={[0, max / 2, max]}
							allowDecimals={false}
							tickLine={false}
							axisLine={false}
						/>
						<XAxis
							dataKey="day"
							ticks={ticks}
							tickFormatter={(day: string) => short.format(dayDate(day))}
							tickLine={false}
							axisLine={false}
							tickMargin={8}
						/>
						<ChartTooltip
							cursor={{ fill: "var(--chart-track)" }}
							content={
								<ChartTooltipContent
									hideIndicator
									labelFormatter={(_, payload) => {
										const day = payload?.[0]?.payload as Day | undefined;
										return day ? long.format(dayDate(day.day)) : null;
									}}
								/>
							}
						/>
						<Bar dataKey="leads" radius={[2, 2, 0, 0]} isAnimationActive={false}>
							{days.map((day, index) => (
								<Cell
									key={day.day}
									fill={index === last ? "var(--chart-strong)" : "var(--color-leads)"}
									// The day and its count, for E2E to read what each bar draws (Home 5).
									data-test="leads-by-day-bar"
									data-day={day.day}
									data-leads={day.leads}
								/>
							))}
						</Bar>
					</BarChart>
				</ChartContainer>
				{total === 0 ? (
					<p className="inset-0 px-6 text-sm absolute flex items-center justify-center text-center text-pretty text-muted-foreground">
						{t("funnel.noLeads")}
					</p>
				) : null}
			</div>
		</Card>
	);
}
