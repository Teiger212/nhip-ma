import { formatDuration } from "@home/lib/duration";
import { FUNNEL_WINDOW_DAYS, loadHomeFunnel } from "@home/lib/funnel";
import type { Funnel } from "@repo/database/inbox";
import { PageHeader } from "@shared/components/PageHeader";
import { getLocale, getTranslations } from "next-intl/server";

/**
 * Home is the numbers screen (ADR 0001): the office funnel (ADR 0002) with response time
 * under it, the same for every operator. Leads in, engaged and in conversation are counted
 * from Answers inside the store (ADR 0011) over one fixed window; closings and lost only
 * ever come from the office's CRM (ADR 0003), so until one is connected those two say so
 * rather than show a zero that looks like a fact.
 */
const COUNTED = ["leadsIn", "engaged", "inConversation"] as const;
const FROM_CRM = ["closings", "lost"] as const;

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
		<li className="min-h-36 gap-2 p-4 flex flex-col rounded-md border bg-card">
			<p className="text-xs font-medium text-muted-foreground">
				<span className="font-mono mr-1.5 tabular-nums">{index}</span>
				{label}
			</p>
			{children}
		</li>
	);
}

function Count({
	value,
	of,
	hint,
}: {
	value: number;
	/** The stage above, for the share bar; omitted on the first stage. */
	of?: number;
	hint: string;
}) {
	const share = of === undefined ? 1 : of > 0 ? value / of : 0;
	return (
		<div className="mt-auto">
			<p className="font-mono text-3xl leading-none text-foreground tabular-nums">{value}</p>
			<div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-muted">
				<div
					className="h-full rounded-full bg-primary transition-[width]"
					style={{ width: `${Math.round(share * 100)}%` }}
				/>
			</div>
			<p className="mt-2 text-xs text-pretty text-muted-foreground">{hint}</p>
		</div>
	);
}

function ResponseTime({ funnel, locale, t }: { funnel: Funnel; locale: string; t: Translate }) {
	const time = funnel.responseTime;
	return (
		<section
			aria-labelledby="home-response-time"
			className="mt-6 gap-2 p-4 flex flex-col rounded-md border bg-card"
		>
			<p id="home-response-time" className="text-xs font-medium text-muted-foreground">
				{t("responseTime")}
			</p>
			{time ? (
				<div className="gap-x-6 gap-y-1 flex flex-wrap items-baseline">
					<p className="font-mono text-3xl leading-none text-foreground tabular-nums">
						{formatDuration(time.medianMs, locale)}
						<span className="ml-2 text-xs font-sans text-muted-foreground">{t("median")}</span>
					</p>
					<p className="font-mono text-sm text-muted-foreground tabular-nums">
						{t("p90", { value: formatDuration(time.p90Ms, locale) })}
					</p>
					<p className="text-xs text-muted-foreground">{t("answered", { count: time.answered })}</p>
				</div>
			) : (
				<p
					aria-hidden="true"
					className="font-mono text-3xl leading-none text-muted-foreground/40 tabular-nums"
				>
					—
				</p>
			)}
			<p className="text-xs text-pretty text-muted-foreground">
				{t("responseTimeHint")} {time ? null : t("noResponseTime")}
			</p>
		</section>
	);
}

export async function Home() {
	const [t, locale, loaded] = await Promise.all([
		getTranslations("home"),
		getLocale(),
		loadHomeFunnel(),
	]);
	const funnel = loaded.funnel;
	const hints: Record<(typeof COUNTED)[number], (funnel: Funnel) => string> = {
		leadsIn: (f) => (f.leadsIn === 0 ? t("funnel.noLeads") : t("funnel.leadsInHint")),
		engaged: (f) => t("funnel.ofLeads", { percent: percent(f.engaged, f.leadsIn) }),
		inConversation: (f) => t("funnel.ofLeads", { percent: percent(f.inConversation, f.leadsIn) }),
	};
	return (
		<div className="max-w-5xl px-4 py-6 mx-auto w-full">
			<PageHeader title={t("title")} subtitle={t("subtitle")} className="mb-6" />
			{loaded.denied ? (
				<p className="p-4 text-sm rounded-md border bg-card text-pretty">
					{t(`denied.${loaded.denied}`)}
				</p>
			) : null}
			<section aria-labelledby="home-funnel">
				<div className="mb-3 gap-3 flex items-baseline justify-between">
					<h3 id="home-funnel" className="text-sm font-semibold tracking-tight font-heading">
						{t("funnel.title")}
					</h3>
					<p className="text-xs text-muted-foreground">
						{t("window", { days: FUNNEL_WINDOW_DAYS })}
					</p>
				</div>
				<ol className="gap-3 md:grid-cols-5 grid grid-cols-2">
					{COUNTED.map((stage, index) => (
						<Stage key={stage} index={index + 1} label={t(`funnel.${stage}`)}>
							{funnel ? (
								<Count
									value={funnel[stage]}
									of={stage === "leadsIn" ? undefined : funnel.leadsIn}
									hint={hints[stage](funnel)}
								/>
							) : (
								<p
									aria-hidden="true"
									className="font-mono text-3xl mt-auto leading-none text-muted-foreground/40 tabular-nums"
								>
									—
								</p>
							)}
						</Stage>
					))}
					{FROM_CRM.map((stage, index) => (
						<Stage key={stage} index={COUNTED.length + index + 1} label={t(`funnel.${stage}`)}>
							<div className="mt-auto">
								<p className="text-sm font-semibold text-foreground">{t("connectCrm")}</p>
								<p className="mt-1 text-xs text-pretty text-muted-foreground">
									{t("connectCrmHint")}
								</p>
							</div>
						</Stage>
					))}
				</ol>
			</section>
			{funnel ? <ResponseTime funnel={funnel} locale={locale} t={t} /> : null}
		</div>
	);
}

function percent(part: number, whole: number): number {
	return whole === 0 ? 0 : Math.round((part / whole) * 100);
}
