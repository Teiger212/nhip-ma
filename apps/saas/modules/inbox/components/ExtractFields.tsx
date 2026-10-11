"use client";

import { cn, Sheet, SheetContent, SheetTitle } from "@repo/ui";
import { ChevronRightIcon, FileWarningIcon, MapPinIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Fragment, type ReactNode, useMemo, useState } from "react";

import { arrangeExtractRows, type ExtractFieldId, type ExtractRow } from "../lib/extract-rows";
import { languageTone } from "../lib/fact-tags";
import { formatGuestDetail } from "../lib/guest-details-format";
import { isSupportedLanguage, languageName } from "../lib/language-name";
import type { Conversation } from "../lib/types";
import { FactTag } from "./ThreadParts";

/** The guest's own facts, under the stay. */
const GUEST_FIELDS = ["language", "nationality", "inVietnamNow", "paperwork"] as const;

type GuestField = (typeof GUEST_FIELDS)[number];

/** The guest's details as the operator reads them: each known fact in words, and what to ask. */
type Details = {
	values: Partial<Record<ExtractFieldId, string>>;
	/** The guest language's code, for its tag's colour. */
	languageCode: string | null;
	/** What the guest still owes (#244), in the auto-reply's order, named in words. */
	missing: string | null;
	label: (id: ExtractFieldId) => string;
	missingLabel: string;
	notGiven: string;
};

/**
 * The details to show, translated: every known fact, then what the agent should still ask for
 * (#244). Presence was decided upstream from the values, never from rendered text.
 */
function useDetails(conversation: Conversation): Details {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const { rows, missing } = useMemo(
		() => arrangeExtractRows(conversation.oneShot),
		[conversation.oneShot],
	);
	const value = (row: ExtractRow): string => {
		switch (row.id) {
			case "language": {
				// An unsupported guest language is named, with the note that replies are English (#245).
				const code = String(row.value);
				const name = languageName(code, locale, (language) => t(`guestLanguage.${language}`));
				return isSupportedLanguage(code) ? name : t("languageUnsupported", { language: name });
			}
			case "rentOrBuy":
				return t(`intent.${String(row.value)}`);
			case "inVietnamNow":
				return row.value ? t("yes") : t("no");
			case "paperwork":
				return t("paperworkFlag");
			default:
				// Move-in, stay, budget, nationality and household in words; anything else as stored (#243).
				// They read in the office language (ADR 0025): a member's interface locale is the office
				// language, as the authenticated layout redirects them to it, and the inbox refuses
				// anyone who isn't a member.
				return formatGuestDetail(row.id, String(row.value), locale, (key, values) =>
					t(key, values),
				);
		}
	};
	const languageRow = rows.find((row) => row.id === "language");
	return {
		values: Object.fromEntries(rows.map((row) => [row.id, value(row)])),
		languageCode: languageRow ? String(languageRow.value) : null,
		missing:
			missing.length > 0
				? missing.map((id) => t(`fields.${id}`).toLocaleLowerCase(locale)).join(", ")
				: null,
		label: (id) => t(`fields.${id}`),
		missingLabel: t("missingLabel"),
		notGiven: t("details.notGiven"),
	};
}

/** A missing fact's value: a dash to the eye, "Not given yet" to a screen reader. */
function NotGiven({ notGiven }: { notGiven: string }) {
	return (
		<>
			<span aria-hidden="true">—</span>
			<span className="sr-only">{notGiven}</span>
		</>
	);
}

/** The Missing row (#244): a term and its value in the Waiting tone, one more row of the stay. */
function MissingRow({ details, className }: { details: Details; className?: string }) {
	if (!details.missing) return null;
	return (
		<div className={cn("gap-1.5 min-w-0 flex items-baseline", className)}>
			<dt className="font-semibold shrink-0 text-muted-foreground">{details.missingLabel}</dt>
			<dd className="font-semibold min-w-0 text-muted-foreground">{details.missing}</dd>
		</div>
	);
}

/** A guest fact's value: the language as its coloured tag, anything else in ink. */
function guestValue(details: Details, id: GuestField): ReactNode {
	const value = details.values[id];
	if (id === "language" && value && details.languageCode) {
		return (
			<FactTag tone={languageTone(details.languageCode)} wrap>
				{value}
			</FactTag>
		);
	}
	return value;
}

/**
 * The paperwork flag on the strip (#327): a compact Amber Note chip in place of its three lines
 * of prose. It opens the details sheet, where the flag reads in full; its target is 44px tall
 * though the chip is 24px, so the strip stays one line.
 */
function PaperworkChip({ label, onOpen }: { label: string; onOpen: () => void }) {
	return (
		<button
			type="button"
			onClick={onOpen}
			data-test="paperwork-chip"
			className="h-6 gap-1 px-1.5 text-xs font-bold after:-inset-y-2.5 after:-inset-x-1 ease-out relative inline-flex cursor-pointer items-center rounded-md bg-warning/12 whitespace-nowrap text-warning transition-colors duration-200 after:absolute hover:bg-warning/20 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden motion-reduce:transition-none"
		>
			<FileWarningIcon aria-hidden="true" className="size-3.5 shrink-0" />
			{label}
		</button>
	);
}

/**
 * The guest's own facts, those Nhịp has: a label/value list, or pairs along a line. On the strip
 * the paperwork flag is a chip that opens the sheet (`onOpen`) rather than its whole text.
 */
function GuestFacts({
	details,
	layout,
	onOpen,
}: {
	details: Details;
	layout: "rail" | "strip";
	onOpen?: () => void;
}) {
	const known = GUEST_FIELDS.filter((id) => details.values[id] !== undefined);
	if (known.length === 0) return null;
	if (layout === "rail") {
		return (
			<dl className="gap-x-3 gap-y-2.5 text-sm min-w-0 grid-cols-fields grid items-baseline">
				{known.map((id) => (
					<Fragment key={id}>
						<dt className="text-note font-medium text-muted-foreground">{details.label(id)}</dt>
						<dd className="font-bold min-w-0">{guestValue(details, id)}</dd>
					</Fragment>
				))}
			</dl>
		);
	}
	return (
		<dl className="gap-x-4 gap-y-1 text-xs min-w-0 flex flex-wrap items-baseline">
			{known.map((id) =>
				id === "paperwork" && onOpen ? (
					<div key={id} className="flex items-center">
						<dt className="sr-only">{details.label(id)}</dt>
						<dd>
							<PaperworkChip label={details.label(id)} onOpen={onOpen} />
						</dd>
					</div>
				) : (
					<div key={id} className="gap-1.5 min-w-0 flex items-baseline">
						<dt className="shrink-0 text-muted-foreground">{details.label(id)}</dt>
						<dd className="font-semibold min-w-0">{guestValue(details, id)}</dd>
					</div>
				),
			)}
		</dl>
	);
}

/** A stay fact the guest hasn't given, in the field box's place: a dashed open slot with a "?". */
function OpenSlot({ details, id }: { details: Details; id: "moveIn" | "budget" }) {
	return (
		<div className="gap-3 px-3 pt-2.5 pb-3 border-open flex items-center rounded-lg bg-canvas">
			<div className="min-w-0 flex-1">
				<dt className="text-key font-extrabold uppercase">{details.label(id)}</dt>
				<dd className="mt-0.5 text-base font-bold text-muted-foreground">
					<NotGiven notGiven={details.notGiven} />
				</dd>
			</div>
			<span
				aria-hidden="true"
				className="size-7.5 text-sm font-extrabold border-open grid shrink-0 place-items-center rounded-full text-muted-foreground"
			>
				?
			</span>
		</div>
	);
}

/**
 * The stay card (#314), at the top of the details rail, the way a booking summary opens on the
 * slot you picked: the area as its title, rent or buy and beds under it, then a field box with
 * the move-in and the stay length side by side (#317) over the budget. A missing move-in or
 * budget is a dashed open slot in the box's place, never inside its frame, and the Missing row
 * under them names what to ask for (#244); a stay length is optional, so a missing one is
 * simply not shown.
 * Its labels stay terms of one list, so the area's is there for a screen reader where the pin
 * stands for it.
 */
function StayCard({ details }: { details: Details }) {
	const { values, label, notGiven } = details;
	const subtitle = (["rentOrBuy", "beds"] as const).map((id) =>
		values[id] !== undefined ? (
			<div key={id} className="contents">
				<dt className="sr-only">{label(id)}</dt>
				<dd>{values[id]}</dd>
			</div>
		) : (
			<div
				key={id}
				className="gap-1 px-1.5 text-xs border-open inline-flex items-baseline rounded-md bg-canvas"
			>
				<dt>{label(id)}</dt>
				<dd>
					<NotGiven notGiven={notGiven} />
				</dd>
			</div>
		),
	);
	const given = (["moveIn", "stay", "budget"] as const).filter((id) => values[id] !== undefined);
	// Move-in and stay share the box's first row when both are there; the budget has its own.
	const paired = given.includes("moveIn") && given.includes("stay");
	const open = (["moveIn", "budget"] as const).filter((id) => values[id] === undefined);
	return (
		<dl className="flex flex-col">
			<div className="gap-2.5 flex items-start">
				<MapPinIcon aria-hidden="true" className="mt-1.5 size-4.5 shrink-0 text-muted-foreground" />
				<div className="min-w-0 flex-1">
					{values.area !== undefined ? (
						<>
							<dt className="sr-only">{label("area")}</dt>
							<dd className="text-stay font-extrabold break-words">{values.area}</dd>
						</>
					) : (
						<div className="gap-2 px-3 py-1.5 border-open flex items-baseline rounded-lg bg-canvas">
							<dt className="text-key font-extrabold uppercase">{label("area")}</dt>
							<dd className="text-base font-bold text-muted-foreground">
								<NotGiven notGiven={notGiven} />
							</dd>
						</div>
					)}
					<div className="mt-1 gap-x-1.5 gap-y-1 text-sm font-semibold flex flex-wrap items-baseline text-muted-foreground">
						{subtitle[0]}
						<span aria-hidden="true">·</span>
						{subtitle[1]}
					</div>
				</div>
			</div>
			{given.length > 0 ? (
				<div className="mt-4 grid grid-cols-2 overflow-hidden rounded-lg border">
					{given.map((id) => (
						<div
							key={id}
							className={cn(
								"px-3 pt-2.5 pb-3 border-t first:border-t-0",
								paired && id !== "budget" ? "col-span-1" : "col-span-2",
								paired && id === "stay" && "border-t-0 border-l",
							)}
						>
							<dt className="text-key font-extrabold uppercase">{label(id)}</dt>
							<dd
								className={cn(
									"mt-0.5 break-words",
									id === "budget" ? "text-base font-bold" : "text-sm font-semibold",
								)}
							>
								{values[id]}
							</dd>
						</div>
					))}
				</div>
			) : null}
			{open.length > 0 ? (
				<div className={cn("gap-2 flex flex-col", given.length > 0 ? "mt-2" : "mt-4")}>
					{open.map((id) => (
						<OpenSlot key={id} details={details} id={id} />
					))}
				</div>
			) : null}
			<MissingRow details={details} className="mt-3 text-sm" />
		</dl>
	);
}

/** The stay facts the strip's line reads, after the area and before the budget's frame (#317). */
const LINE_FIELDS = ["rentOrBuy", "beds", "moveIn", "stay"] as const;

/**
 * The narrow pane's stay (#248, #314), as the mockup's phone band: one white line on the canvas,
 * the area in bold, then rent or buy, beds and move-in in Slate, cut short with an ellipsis
 * rather than wrapping, and the budget in its own frame at the end (a dashed slot until the
 * guest gives it). The Missing row under the line names every fact still to ask for, so the line
 * carries no other open slots. The whole line is one 44px target (#327) that opens the details
 * sheet, where nothing is cut: a button laid over it, so the line stays terms of the one list.
 */
function StayLine({ details, onOpen }: { details: Details; onOpen: () => void }) {
	const t = useTranslations("inbox");
	const { values, label, notGiven } = details;
	const known = LINE_FIELDS.filter((id) => values[id] !== undefined);
	return (
		<dl className="gap-1.5 min-w-0 flex flex-col">
			<div className="gap-2 h-11 pr-1.5 pl-2.5 text-note min-w-0 relative flex items-center rounded-lg bg-card">
				<MapPinIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				<div
					data-test="stay-line"
					className="min-w-0 font-semibold flex-1 truncate text-muted-foreground"
				>
					{values.area !== undefined ? (
						<>
							<dt className="sr-only">{label("area")}</dt>
							<dd className="font-extrabold inline text-foreground">{values.area}</dd>
						</>
					) : null}
					{known.map((id, index) => (
						<Fragment key={id}>
							{index > 0 || values.area !== undefined ? <span aria-hidden="true"> · </span> : null}
							<dt className="sr-only">{label(id)}</dt>
							<dd className="inline">{values[id]}</dd>
						</Fragment>
					))}
				</div>
				{values.budget !== undefined ? (
					<div className="contents">
						<dt className="sr-only">{label("budget")}</dt>
						<dd className="h-6.5 px-1.5 font-bold inline-flex shrink-0 items-center rounded-sm border">
							{values.budget}
						</dd>
					</div>
				) : (
					<div className="gap-1 h-6.5 px-1.5 text-xs border-open inline-flex shrink-0 items-center rounded-sm bg-canvas text-muted-foreground">
						<dt>{label("budget")}</dt>
						<dd>
							<NotGiven notGiven={notGiven} />
						</dd>
					</div>
				)}
				<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
				{/* Over the line, drawing its hairline: it turns ink on hover, as an outline button's does. */}
				<button
					type="button"
					onClick={onOpen}
					aria-label={t("details.showAll")}
					className="inset-0 ease-out absolute cursor-pointer rounded-lg border transition-colors duration-200 hover:border-foreground/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-hidden active:bg-foreground/5 motion-reduce:transition-none"
				/>
			</div>
			<MissingRow details={details} className="px-0.5 text-xs" />
		</dl>
	);
}

/** Every stay and guest fact, whole: the rail's body, and the strip's sheet (#327). */
function DetailsBody({ details }: { details: Details }) {
	const t = useTranslations("inbox");
	return (
		<div className="flex flex-col">
			<StayCard details={details} />
			<hr className="mt-5.5 mb-4" />
			<h3 className="mb-3 text-heading font-extrabold">{t("details.guest")}</h3>
			<GuestFacts details={details} layout="rail" />
		</div>
	);
}

/**
 * The guest's details (#314): the stay card, then the guest's own facts. In the details rail
 * the stay is a card over a label/value list, and nothing in it opens or closes. In the narrow
 * pane's strip under the header (#248), a band with the stay along one line and the guest's
 * facts after it; on a phone the facts' line also takes the thread's metadata (`meta`: the CRM
 * status, a manager's owner select), which leave the header there (#94, #303). The strip keeps
 * the conversation its room (#327): the line, and the paperwork chip, open a sheet from the
 * foot of the screen with every fact whole, as the rail has them.
 */
export function ExtractFields({
	conversation,
	layout,
	meta,
}: {
	conversation: Conversation;
	layout: "rail" | "strip";
	meta?: ReactNode;
}) {
	const t = useTranslations("inbox");
	const details = useDetails(conversation);
	const [sheetOpen, setSheetOpen] = useState(false);
	if (layout === "rail") {
		return <DetailsBody details={details} />;
	}
	const open = () => setSheetOpen(true);
	return (
		<div
			data-test="thread-details"
			className="gap-2 px-3 py-2.5 md:px-4 flex shrink-0 flex-col border-b bg-canvas"
		>
			<StayLine details={details} onOpen={open} />
			<div className="gap-x-4 gap-y-1.5 min-w-0 flex flex-wrap items-center">
				<GuestFacts details={details} layout="strip" onOpen={open} />
				{meta}
			</div>
			<Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
				<SheetContent side="bottom">
					{/* Clear of the sheet's close button, at its top right. */}
					<div className="mb-4 pr-10">
						<SheetTitle>{t("details.title")}</SheetTitle>
					</div>
					<DetailsBody details={details} />
				</SheetContent>
			</Sheet>
		</div>
	);
}
