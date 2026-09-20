import { PageHeader } from "@shared/components/PageHeader";
import { getTranslations } from "next-intl/server";

/**
 * Home is the numbers screen (ADR 0001): the office funnel (ADR 0002) with response time
 * under it, the same for every operator. This is the screen before the numbers: the
 * shape is here so nothing shows a zero that looks like a fact. Leads in, engaged and in
 * conversation are counted from the inbox next; closings and lost only ever come from the
 * office's CRM (ADR 0003), so until one is connected those two say so.
 */
const FUNNEL = ["leadsIn", "engaged", "inConversation", "closings", "lost"] as const;
const FROM_CRM: ReadonlySet<(typeof FUNNEL)[number]> = new Set(["closings", "lost"]);

function Placeholder({ hint }: { hint: string }) {
	return (
		<div className="mt-auto">
			<p
				aria-hidden="true"
				className="font-mono text-3xl leading-none text-muted-foreground/40 tabular-nums"
			>
				—
			</p>
			<p className="mt-2 text-xs text-pretty text-muted-foreground">{hint}</p>
		</div>
	);
}

export async function Home() {
	const t = await getTranslations("home");
	return (
		<div className="max-w-5xl px-4 py-6 mx-auto w-full">
			<PageHeader title={t("title")} subtitle={t("subtitle")} className="mb-6" />
			<section aria-labelledby="home-funnel">
				<h3 id="home-funnel" className="mb-3 text-sm font-semibold tracking-tight font-heading">
					{t("funnel.title")}
				</h3>
				<ol className="gap-3 md:grid-cols-5 grid grid-cols-2">
					{FUNNEL.map((stage, index) => (
						<li key={stage} className="min-h-36 gap-2 p-4 flex flex-col rounded-md border bg-card">
							<p className="text-xs font-medium text-muted-foreground">
								<span className="font-mono mr-1.5 tabular-nums">{index + 1}</span>
								{t(`funnel.${stage}`)}
							</p>
							{FROM_CRM.has(stage) ? (
								<div className="mt-auto">
									<p className="text-sm font-semibold text-foreground">{t("connectCrm")}</p>
									<p className="mt-1 text-xs text-pretty text-muted-foreground">
										{t("connectCrmHint")}
									</p>
								</div>
							) : (
								<Placeholder hint={t("comingNext")} />
							)}
						</li>
					))}
				</ol>
			</section>
			<section className="mt-6 gap-2 p-4 flex flex-col rounded-md border bg-card">
				<p className="text-xs font-medium text-muted-foreground">{t("responseTime")}</p>
				<p
					aria-hidden="true"
					className="font-mono text-3xl leading-none text-muted-foreground/40 tabular-nums"
				>
					—
				</p>
				<p className="text-xs text-pretty text-muted-foreground">
					{t("responseTimeHint")} {t("comingNext")}
				</p>
			</section>
		</div>
	);
}
