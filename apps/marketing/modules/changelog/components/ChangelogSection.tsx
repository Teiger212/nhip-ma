"use client";

import { cn } from "@repo/ui";
import { useFormatter, useTranslations } from "next-intl";

const CHANGELOG_ENTRY_KEYS = [
	"clientPortals",
	"planClarity",
	"quietWeek",
	"workspaceSwitching",
	"invites",
	"launch",
] as const;

const CHANGE_ITEM_KEYS = ["item1", "item2", "item3"] as const;

const CHANGE_KINDS = ["added", "improved", "fixed"] as const;

type ChangeKind = (typeof CHANGE_KINDS)[number];

function isChangeKind(value: string): value is ChangeKind {
	return CHANGE_KINDS.some((kind) => kind === value);
}

export function ChangelogSection() {
	const t = useTranslations("changelog");
	const formatter = useFormatter();

	return (
		<section id="changelog">
			<div className="flex w-full flex-col">
				{CHANGELOG_ENTRY_KEYS.map((entryKey, entryIndex) => {
					const version = t(`entries.${entryKey}.version`);
					const isLatest = entryIndex === 0;

					return (
						<article
							key={entryKey}
							className="gap-8 md:grid-cols-[11rem_minmax(0,1fr)] pb-16 last:pb-0 relative grid grid-cols-1"
						>
							<div className="md:pt-1.5">
								<p className="font-medium text-sm whitespace-nowrap text-foreground/45">
									{formatter.dateTime(new Date(`${t(`entries.${entryKey}.date`)}T12:00:00`), {
										dateStyle: "medium",
									})}
								</p>
								{version ? (
									<p className="mt-1 font-medium text-xs tracking-wide text-touch">{version}</p>
								) : null}
							</div>

							<div className="md:border-l md:pl-10 md:border-border/60 relative">
								<span
									className="size-1.5 top-2.5 md:block absolute -left-[3px] hidden rounded-[1.5px] bg-touch"
									aria-hidden
								/>

								<div>
									{isLatest ? (
										<span className="px-2 py-0.5 font-semibold tracking-wide text-xs rounded-full bg-touch text-touch-foreground">
											{t("latest")}
										</span>
									) : null}
									<h2
										className={cn(
											"font-medium text-2xl lg:text-[1.75rem] tracking-tight text-pretty text-foreground",
											isLatest && "mt-3",
										)}
									>
										{t(`entries.${entryKey}.title`)}
									</h2>
								</div>

								<p className="mt-4 text-base leading-relaxed text-pretty text-foreground/70">
									{t(`entries.${entryKey}.summary`)}
								</p>

								<ul className="mt-6 space-y-4">
									{CHANGE_ITEM_KEYS.map((changeKey) => {
										const kindValue = t(`entries.${entryKey}.changes.${changeKey}.kind`);
										const kind = isChangeKind(kindValue) ? kindValue : "improved";

										return (
											<li key={`${entryKey}-${changeKey}`}>
												<p className="font-medium text-xs tracking-wide text-touch">
													{t(`kinds.${kind}`)}
												</p>
												<p className="mt-1 text-sm leading-relaxed text-foreground/60">
													{t(`entries.${entryKey}.changes.${changeKey}.text`)}
												</p>
											</li>
										);
									})}
								</ul>
							</div>
						</article>
					);
				})}
			</div>
		</section>
	);
}
