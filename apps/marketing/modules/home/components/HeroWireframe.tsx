"use client";

import { dummyPortraits } from "@home/lib/dummy-portraits";
import { cn, Logo } from "@repo/ui";
import { Badge } from "@repo/ui/components/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card";
import {
	BotMessageSquareIcon,
	ChevronsUpDownIcon,
	EllipsisVerticalIcon,
	HomeIcon,
	PanelLeftIcon,
	SettingsIcon,
	UserCogIcon,
} from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import Image from "next/image";
import type { ComponentType, SVGProps } from "react";

const PREVIEW_ADDRESS = "app.acme.com";
const SPARKLINE_WIDTH = 160;
const SPARKLINE_HEIGHT = 48;

const NAVIGATION_ITEMS = [
	{ key: "start", icon: HomeIcon, active: true },
	{ key: "chatbot", icon: BotMessageSquareIcon, active: false },
	{ key: "organizationSettings", icon: SettingsIcon, active: false },
	{ key: "accountSettings", icon: UserCogIcon, active: false },
] as const;

const METRIC_CARDS = [
	{
		key: "newClients",
		value: 344,
		valueFormat: "number",
		trend: 0.12,
		color: "#3b82f6",
		gradientId: "hero-wireframe-clients",
		values: [275, 332, 347, 344],
	},
	{
		key: "revenue",
		value: 5243,
		valueFormat: "currency",
		trend: 0.6,
		color: "#10b981",
		gradientId: "hero-wireframe-revenue",
		values: [3800, 5100, 4900, 5243],
	},
	{
		key: "churn",
		value: 0.03,
		valueFormat: "percentage",
		trend: -0.3,
		color: "#8b5cf6",
		gradientId: "hero-wireframe-churn",
		values: [0.038, 0.032, 0.028, 0.03],
	},
] as const;

const CHART_MONTH_INDEXES = [1, 2, 3, 4] as const;

function buildSparklinePaths(values: readonly number[]) {
	const minimumValue = Math.min(...values);
	const maximumValue = Math.max(...values);
	const valueRange = maximumValue - minimumValue || 1;
	const horizontalPadding = 2;
	const verticalPadding = 4;
	const drawableWidth = SPARKLINE_WIDTH - horizontalPadding * 2;
	const drawableHeight = SPARKLINE_HEIGHT - verticalPadding * 2;
	const step = drawableWidth / Math.max(values.length - 1, 1);

	const points = values.map((value, index) => ({
		x: horizontalPadding + index * step,
		y: verticalPadding + (1 - (value - minimumValue) / valueRange) * drawableHeight,
	}));

	const linePath = points
		.map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(1)} ${point.y.toFixed(1)}`)
		.join(" ");

	const firstPoint = points[0];
	const lastPoint = points.at(-1);

	if (!firstPoint || !lastPoint) {
		return { linePath: "", areaPath: "" };
	}

	const areaPath = `${linePath} L${lastPoint.x.toFixed(1)} ${SPARKLINE_HEIGHT} L${firstPoint.x.toFixed(1)} ${SPARKLINE_HEIGHT} Z`;

	return { linePath, areaPath };
}

export function HeroWireframe() {
	const t = useTranslations("home.hero");

	return (
		<figure className="shadow-olive-950/30 dark:shadow-black/70 m-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_24px_80px_-32px]">
			<figcaption className="sr-only">{t("imageAlt")}</figcaption>
			<div aria-hidden className="pointer-events-none select-none">
				<BrowserChrome />
				<div className="md:min-h-[28rem] flex min-h-[22rem]">
					<Sidebar />
					<MainPreview />
				</div>
			</div>
		</figure>
	);
}

function BrowserChrome() {
	return (
		<div className="gap-3 px-3 py-2 grid grid-cols-[auto_1fr_auto] items-center border-b border-border/60">
			<div className="gap-1.5 flex items-center">
				<span className="size-2.5 rounded-full bg-[#FF5F57]" />
				<span className="size-2.5 rounded-full bg-[#FEBC2E]" />
				<span className="size-2.5 rounded-full bg-[#28C840]" />
			</div>
			<div className="max-w-xs px-3 py-1 text-xs mx-auto w-full truncate rounded-md bg-muted/70 text-center text-foreground/40">
				{PREVIEW_ADDRESS}
			</div>
			<div className="w-[42px]" />
		</div>
	);
}

function Sidebar() {
	const t = useTranslations("home.hero.preview");

	return (
		<aside className="w-52 p-3 md:flex hidden shrink-0 flex-col border-r border-border/60">
			<div className="mb-3 flex items-center justify-between">
				<Logo withLabel={false} className="[&>svg]:size-6" />
				<PanelLeftIcon className="size-3.5 text-foreground/35" />
			</div>

			<div className="gap-2 px-2 py-1.5 mb-4 flex items-center rounded-lg border border-border/70 bg-background">
				<span className="size-6 flex items-center justify-center rounded-md bg-foreground/8">
					<Logo withLabel={false} className="[&>svg]:size-3.5" />
				</span>
				<span className="min-w-0 font-medium text-xs flex-1 truncate">{t("organization")}</span>
				<ChevronsUpDownIcon className="size-3 text-foreground/35" />
			</div>

			<nav className="gap-0.5 flex flex-col">
				{NAVIGATION_ITEMS.map((item) => (
					<NavigationItem
						key={item.key}
						icon={item.icon}
						label={t(item.key)}
						active={item.active}
					/>
				))}
			</nav>

			<div className="gap-2 pt-4 mt-auto flex items-center">
				<Image src={dummyPortraits.item1} alt="" className="size-7 rounded-full object-cover" />
				<div className="min-w-0 flex-1">
					<p className="font-medium text-xs truncate text-foreground">{t("userName")}</p>
					<p className="text-xs truncate text-foreground/40">{t("userEmail")}</p>
				</div>
				<EllipsisVerticalIcon className="size-3.5 text-foreground/35" />
			</div>
		</aside>
	);
}

function NavigationItem({
	icon: Icon,
	label,
	active,
}: {
	icon: ComponentType<SVGProps<SVGSVGElement>>;
	label: string;
	active: boolean;
}) {
	return (
		<div
			className={cn(
				"gap-2 px-2 py-1.5 text-xs flex items-center rounded-md",
				active ? "font-medium bg-touch/10 text-foreground" : "text-foreground/50",
			)}
		>
			<Icon className={cn("size-3.5 shrink-0", active && "text-touch")} />
			<span className="truncate">{label}</span>
		</div>
	);
}

function MainPreview() {
	const t = useTranslations("home.hero.preview");
	const format = useFormatter();
	const monthLabels = CHART_MONTH_INDEXES.map((monthIndex) =>
		format.dateTime(new Date(Date.UTC(2026, monthIndex, 1)), {
			month: "short",
			timeZone: "UTC",
		}),
	);

	return (
		<div className="min-w-0 p-4 sm:p-5 lg:p-6 flex-1 bg-muted/35">
			<h3 className="font-medium text-xl tracking-tight lg:text-2xl text-foreground">
				{t("organization")}
			</h3>
			<p className="mt-1 text-sm text-foreground/50">{t("welcome")}</p>

			<div className="mt-5 gap-3 sm:grid-cols-3 grid grid-cols-1">
				{METRIC_CARDS.map((metricCard) => (
					<MetricCard
						key={metricCard.key}
						title={t(metricCard.key)}
						value={formatMetricValue(format, metricCard.value, metricCard.valueFormat)}
						trend={format.number(metricCard.trend, {
							style: "percent",
							signDisplay: "exceptZero",
						})}
						trendPositive={metricCard.trend > 0}
						color={metricCard.color}
						gradientId={metricCard.gradientId}
						values={metricCard.values}
						monthLabels={monthLabels}
					/>
				))}
			</div>

			<Card className="mt-4 rounded-xl">
				<div className="h-36 sm:h-44 lg:h-52 text-sm flex items-center justify-center text-foreground/45">
					{t("placeholder")}
				</div>
			</Card>
		</div>
	);
}

function formatMetricValue(
	format: ReturnType<typeof useFormatter>,
	value: number,
	valueFormat: "number" | "currency" | "percentage",
) {
	if (valueFormat === "currency") {
		return format.number(value, {
			style: "currency",
			currency: "USD",
		});
	}

	if (valueFormat === "percentage") {
		return format.number(value, { style: "percent" });
	}

	return format.number(value);
}

function MetricCard({
	title,
	value,
	trend,
	trendPositive,
	color,
	gradientId,
	values,
	monthLabels,
}: {
	title: string;
	value: string;
	trend: string;
	trendPositive: boolean;
	color: string;
	gradientId: string;
	values: readonly number[];
	monthLabels: string[];
}) {
	const { linePath, areaPath } = buildSparklinePaths(values);

	return (
		<Card className="rounded-xl">
			<CardHeader className="p-3.5 pb-2">
				<CardTitle className="font-medium text-xs text-foreground/50">{title}</CardTitle>
			</CardHeader>
			<CardContent className="p-3.5 pt-0">
				<div className="flex items-center justify-between">
					<strong className="font-semibold text-lg tracking-tight text-foreground">{value}</strong>
					<Badge status={trendPositive ? "success" : "error"} className="px-2 py-0.5 normal-case">
						{trend}
					</Badge>
				</div>
				<svg
					viewBox={`0 0 ${SPARKLINE_WIDTH} ${SPARKLINE_HEIGHT}`}
					className="mt-3 h-12 w-full"
					aria-hidden
				>
					<defs>
						<linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
							<stop offset="0%" stopColor={color} stopOpacity="0.35" />
							<stop offset="100%" stopColor={color} stopOpacity="0" />
						</linearGradient>
					</defs>
					<path d={areaPath} fill={`url(#${gradientId})`} />
					<path
						d={linePath}
						fill="none"
						stroke={color}
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					/>
				</svg>
				<div className="mt-1 gap-0 text-xs flex justify-between text-foreground/35">
					{monthLabels.map((monthLabel) => (
						<span key={monthLabel}>{monthLabel}</span>
					))}
				</div>
			</CardContent>
		</Card>
	);
}
