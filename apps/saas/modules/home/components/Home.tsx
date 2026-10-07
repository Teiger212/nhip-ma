import { durationParts } from "@home/lib/duration";
import { FUNNEL_WINDOW_DAYS, loadHomeFunnel } from "@home/lib/funnel";
import { OFFICE_TIME_ZONE } from "@home/lib/window";
import type { CrmOutcomeCounts, Funnel } from "@repo/database/inbox";
import { Card, cn } from "@repo/ui";
import { PageHeader } from "@shared/components/PageHeader";
import { getLocale, getTranslations } from "next-intl/server";

import { count, Figure, ShareBar } from "./HomeParts";
import { LeadsByDay } from "./LeadsByDay";
import { WaitingNow } from "./WaitingNow";

/**
 * Home is the numbers screen (ADR 0001): the office funnel (ADR 0002) with leads by day,
 * who is waiting now, and response time, the same for every operator. Leads in, engaged
 * and in conversation are counted from Answers inside the store (ADR 0011) over one fixed
 * window of the office's local days; closings and lost only ever come from the office's
 * CRM (ADR 0003): the distinct won and lost leads Nhịp cached from it, "as of" the last time
 * it heard from the CRM, never a call to it (#68). An office with no CRM sees those two
 * hatched with "No CRM" rather than a zero that looks like a fact.
 */
const COUNTED = ["leadsIn", "engaged", "inConversation"] as const;
const FROM_CRM = ["closings", "lost"] as const;
const BUCKETS = ["under5m", "from5to15m", "from15to60m", "over60m"] as const;

/**
 * The funnel strip's dividers: one row of five from `lg`; below it, leads in across the
 * top and the other four two by two.
 */
const CELL_EDGES = [
	"col-span-2 lg:col-span-1",
	"border-t lg:border-t-0 lg:border-l",
	"border-t border-l lg:border-t-0",
	"border-t lg:border-t-0 lg:border-l",
	"border-t border-l lg:border-t-0",
] as const;

type Translate = Awaited<ReturnType<typeof getTranslations<"home">>>;

function Stage({
	index,
	label,
	children,
}: {
	index: number;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<li className={cn("gap-3 p-4 md:p-5 lg:min-h-44 flex flex-col", CELL_EDGES[index])}>
			<p className="gap-2 text-xs font-medium flex text-muted-foreground">
				<span className="font-mono font-normal text-muted-foreground tabular-nums">
					{index + 1}
				</span>
				{label}
			</p>
			{children}
		</li>
	);
}

function FunnelStrip({
	funnel,
	crm,
	locale,
	t,
}: {
	funnel: Funnel;
	crm: CrmOutcomeCounts | null;
	locale: string;
	t: Translate;
}) {
	const hints: Record<(typeof COUNTED)[number], string> = {
		leadsIn: funnel.leadsIn === 0 ? t("funnel.noLeads") : t("funnel.leadsInHint"),
		engaged: t("funnel.ofLeads", { percent: percent(funnel.engaged, funnel.leadsIn) }),
		inConversation: t("funnel.ofLeads", {
			percent: percent(funnel.inConversation, funnel.leadsIn),
		}),
	};
	return (
		<Card className="overflow-hidden">
			<h3 id="home-funnel" className="sr-only">
				{t("funnel.title")}
			</h3>
			<ol aria-labelledby="home-funnel" className="lg:grid-cols-5 grid grid-cols-2">
				{COUNTED.map((stage, index) => (
					<Stage key={stage} index={index} label={t(`funnel.${stage}`)}>
						<Figure parts={count(funnel[stage])} className="mt-1" />
						<ShareBar
							share={
								stage === "leadsIn"
									? funnel.leadsIn > 0
										? 1
										: 0
									: funnel.leadsIn > 0
										? funnel[stage] / funnel.leadsIn
										: 0
							}
						/>
						<p className="text-xs text-pretty text-muted-foreground">{hints[stage]}</p>
					</Stage>
				))}
				{FROM_CRM.map((stage, index) => (
					<Stage key={stage} index={COUNTED.length + index} label={t(`funnel.${stage}`)}>
						<div data-test={`home-${stage}`} className="gap-3 flex flex-col">
							{crm ? (
								<>
									<Figure parts={count(crm[stage])} className="mt-1" />
									<ShareBar share={funnel.leadsIn > 0 ? crm[stage] / funnel.leadsIn : 0} />
									<p className="text-xs text-pretty text-muted-foreground">
										{crm.asOf
											? t("crm.asOf", { time: formatAsOf(crm.asOf, locale) })
											: t("crm.nothingYet")}
									</p>
								</>
							) : (
								<>
									<div className="mt-1 h-10 px-3 shadow-hairline hatched flex items-center rounded-lg">
										<span className="px-2 py-0.5 text-xs font-medium rounded-md bg-card text-foreground">
											{t("crm.none")}
										</span>
									</div>
									<p className="text-xs text-pretty text-muted-foreground">{t("crm.noneHint")}</p>
								</>
							)}
						</div>
					</Stage>
				))}
			</ol>
		</Card>
	);
}

function ResponseTime({ funnel, locale, t }: { funnel: Funnel; locale: string; t: Translate }) {
	const time = funnel.responseTime;
	const answered = time?.answered ?? 0;
	return (
		<Card aria-labelledby="home-response-time" className="md:grid-cols-3 grid overflow-hidden">
			<div className="gap-3 p-4 md:p-5 md:border-r md:border-b-0 flex flex-col border-b">
				<h3 id="home-response-time" className="text-xs font-medium text-muted-foreground">
					{t("responseTime")}
				</h3>
				{time ? (
					<>
						<div className="gap-2 mt-3 flex items-baseline">
							<Figure parts={durationParts(time.medianMs, locale)} />
							<span className="text-sm text-muted-foreground">{t("median")}</span>
						</div>
						<p className="text-sm text-muted-foreground">
							{t("p90", { value: formatParts(time.p90Ms, locale) })}
							<span aria-hidden="true"> · </span>
							{t("answered", { count: time.answered })}
						</p>
					</>
				) : (
					<Figure parts={[{ value: "–", number: true }]} muted className="mt-3" />
				)}
				<p className="text-xs text-pretty text-muted-foreground">
					{t("responseTimeHint")} {time ? null : t("noResponseTime")}
				</p>
			</div>
			<ul
				aria-label={t("spread.label")}
				className="gap-3.5 p-4 md:p-5 md:col-span-2 grid content-center"
			>
				{BUCKETS.map((bucket) => {
					const value = time?.buckets[bucket] ?? 0;
					const share = answered > 0 ? value / answered : 0;
					return (
						<li key={bucket} className="gap-3 text-sm grid-cols-bucket grid items-center">
							<span className="text-foreground">{t(`spread.${bucket}`)}</span>
							<ShareBar
								share={share}
								size="thick"
								tone={bucket === "under5m" ? "strong" : "soft"}
							/>
							<span className="text-xs text-right text-muted-foreground tabular-nums">
								<span className="font-mono font-medium text-foreground">{value}</span>
								<span aria-hidden="true"> · </span>
								<span className="font-mono">{percent(value, answered)}</span>%
							</span>
						</li>
					);
				})}
			</ul>
		</Card>
	);
}

export async function Home() {
	const [t, locale, loaded] = await Promise.all([
		getTranslations("home"),
		getLocale(),
		loadHomeFunnel(),
	]);
	const funnel = loaded.funnel;
	return (
		<div className="max-w-6xl md:px-2 mx-auto w-full">
			<PageHeader
				title={t("title")}
				subtitle={t("subtitle")}
				className="mb-4 md:mb-5"
				aside={
					<span className="h-7 px-2.5 text-xs shadow-hairline inline-flex items-center rounded-md bg-card whitespace-nowrap text-muted-foreground">
						{t("window", { days: FUNNEL_WINDOW_DAYS })}
					</span>
				}
			/>
			{loaded.denied ? (
				<Card className="p-5">
					<p className="text-sm text-pretty">{t(`denied.${loaded.denied}`)}</p>
				</Card>
			) : funnel ? (
				<div className="gap-2.5 md:gap-3 grid">
					<FunnelStrip funnel={funnel} crm={loaded.crm ?? null} locale={locale} t={t} />
					<div className="gap-2.5 md:gap-3 lg:grid-cols-3 grid">
						<div className="min-w-0 lg:col-span-2 grid">
							<LeadsByDay days={funnel.byDay} total={funnel.leadsIn} />
						</div>
						<div className="min-w-0 lg:order-none order-first grid">
							<WaitingNow />
						</div>
					</div>
					<ResponseTime funnel={funnel} locale={locale} t={t} />
				</div>
			) : null}
		</div>
	);
}

function formatParts(ms: number, locale: string): string {
	return durationParts(ms, locale)
		.map((part) => part.value)
		.join("");
}

/** When Nhịp last heard from the CRM, in the office's time zone: "Oct 7, 14:32". */
function formatAsOf(at: string, locale: string): string {
	return new Intl.DateTimeFormat(locale, {
		timeZone: OFFICE_TIME_ZONE,
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
		hourCycle: "h23",
	}).format(new Date(at));
}

function percent(part: number, whole: number): number {
	return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
