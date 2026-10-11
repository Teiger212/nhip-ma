"use client";

import { Badge, cn } from "@repo/ui";
import {
	CheckIcon,
	ClockIcon,
	GlobeIcon,
	MapPinIcon,
	MessageCircleIcon,
	MessageSquareIcon,
	PhoneIcon,
	ReplyIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";

import { isDecided } from "../lib/crm/rules";
import { type AreaTone, areaTone, languageTone, type TagTone } from "../lib/fact-tags";
import { formatGuestDetail } from "../lib/guest-details-format";
import { guestInitials } from "../lib/guest-initials";
import { useOfficeRole } from "../lib/inbox-queries";
import { languageName } from "../lib/language-name";
import { type ThreadStatus, threadStatus } from "../lib/queue";
import type { ConversationSummary, OperatorLanguage, Pipe } from "../lib/types";

/** SaaS routing only serves the operator locales (`modules/i18n/routing.ts`). */
export function useOperatorLanguage(): OperatorLanguage {
	return useLocale() as OperatorLanguage;
}

/**
 * The guest's initials, for Home's Waiting now. The Inbox marks a guest by their language
 * instead (`LanguageMark`, #314). A guest known only by their WhatsApp number gets a phone glyph
 * (`guestLabel`, #94).
 */
export function GuestMark({
	name,
	phone = false,
	selected = false,
}: {
	name: string;
	phone?: boolean;
	selected?: boolean;
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"size-8 font-bold tracking-tight text-micro flex shrink-0 items-center justify-center rounded-lg transition-colors duration-200 motion-reduce:transition-none",
				selected ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
			)}
		>
			{phone ? <PhoneIcon className="size-3.5" strokeWidth={1.75} /> : guestInitials(name)}
		</span>
	);
}

/** What a thread's turn mark says: its status, or a manager's Waiting (ADR 0022). */
export type TurnChip = ThreadStatus | "waiting";

type TurnFields = Pick<
	ConversationSummary,
	"owner" | "unansweredInboundId" | "crm" | "lastGuestInboundAt"
>;

/**
 * The thread's turn as this operator reads it. A manager's chip reads "Your turn" only on a
 * thread they own; on an Unassigned thread or a colleague's it reads "Waiting" (ADR 0022,
 * 2026-10-06). Only the chip changes: views and counts still go by the thread's status.
 */
export function useTurnChip(conversation: TurnFields): TurnChip {
	const status = threadStatus(conversation);
	const { userId, role } = useOfficeRole();
	return status === "yourTurn" && role === "manager" && conversation.owner?.id !== userId
		? "waiting"
		: status;
}

/**
 * The guest's marker (#314): the language they write in, as its code, in a softly squared
 * 28px mark. Filled navy while it's your turn, outlined while it waits on a colleague, muted
 * once the reply has gone (or the CRM has decided the lead). Codes are data, not words, so
 * they are never translated. A thread whose language Nhịp hasn't read yet shows a globe.
 */
export function LanguageMark({
	code,
	chip,
	size = "md",
}: {
	code: string | null;
	chip: TurnChip;
	size?: "md" | "lg";
}) {
	return (
		<span
			aria-hidden="true"
			className={cn(
				"font-extrabold tracking-wider flex shrink-0 items-center justify-center rounded-lg leading-none tabular-nums",
				size === "lg" ? "size-9.5 text-xs" : "size-7 text-2xs",
				chip === "yourTurn"
					? "bg-foreground text-background"
					: chip === "waiting"
						? "border-mark bg-card text-muted-foreground"
						: "bg-muted-strong text-muted-foreground",
			)}
		>
			{code ? code.slice(0, 2).toUpperCase() : <GlobeIcon className="size-3.5" />}
		</span>
	);
}

/** The plate of each turn: filled navy, outlined with a clock, or bare with a check. */
const PLATE_TONE = {
	yourTurn: "bg-foreground text-background font-bold",
	waiting: "border border-mist text-muted-foreground font-semibold",
	sent: "px-0.5 text-muted-foreground font-semibold",
	won: "px-0.5 text-muted-foreground font-semibold",
	lost: "px-0.5 text-muted-foreground font-semibold",
} as const satisfies Record<TurnChip, string>;

const PLATE_ICON = {
	yourTurn: ReplyIcon,
	waiting: ClockIcon,
	sent: CheckIcon,
	won: null,
	lost: null,
} as const;

/**
 * Whose turn it is (CONTEXT.md, Your turn; DESIGN.md, The Turn Is The Signal Rule): a navy
 * "Your turn" plate, an outlined "Waiting" plate with a clock, a bare "Sent" with a check. The
 * CRM's Won and Lost stand in the turn's place, bare and slate like the pipe beside them: an
 * outcome is not a turn, and Lost is not an error.
 */
export function TurnPlate({
	conversation,
	size = "md",
}: {
	conversation: TurnFields;
	size?: "md" | "lg";
}) {
	const t = useTranslations("inbox");
	const status = threadStatus(conversation);
	const chip = useTurnChip(conversation);
	const Icon = PLATE_ICON[chip];
	return (
		<span
			data-test="thread-status"
			data-status={chip}
			className={cn(
				"inline-flex shrink-0 items-center rounded-sm leading-none whitespace-nowrap",
				size === "lg" ? "h-7.5 gap-1.5 px-2.5 text-sm" : "h-5.5 gap-1 px-1.5 text-xs",
				PLATE_TONE[chip],
			)}
		>
			{Icon ? <Icon aria-hidden="true" className={size === "lg" ? "size-4" : "size-3.5"} /> : null}
			{isDecided(status) ? t(`crm.${status}`) : t(chip)}
		</span>
	);
}

const PIPE_ICON = { whatsapp: MessageCircleIcon, zalo: MessageSquareIcon } as const;

/** The pipe the guest wrote on, as a small glyph and its name in slate. */
export function PipeLabel({
	pipe,
	size = "sm",
	iconOnly = false,
}: {
	pipe: Pipe;
	size?: "sm" | "md";
	/** The glyph alone, its name for a screen reader: a phone header with no room for words. */
	iconOnly?: boolean;
}) {
	const t = useTranslations("inbox");
	const Icon = PIPE_ICON[pipe];
	return (
		<span
			className={cn(
				"inline-flex shrink-0 items-center whitespace-nowrap text-muted-foreground",
				size === "md" ? "gap-1.5 text-note font-semibold" : "gap-1 text-xs font-medium",
			)}
		>
			<Icon aria-hidden="true" className={size === "md" ? "size-4" : "size-3.5"} />
			<span className={iconOnly ? "sr-only" : undefined}>{t(`pipes.${pipe}`)}</span>
		</span>
	);
}

/**
 * Who holds the thread (ADR 0022): Unassigned, you, or a colleague, for a manager only. An agent
 * sees only their own threads, so for them it would always say "Yours" (#94).
 */
export function OwnerFlag({ conversation }: { conversation: Pick<ConversationSummary, "owner"> }) {
	const t = useTranslations("inbox");
	const { userId, role, pending } = useOfficeRole();
	if (!pending && role !== "manager") return null;
	const owner = conversation.owner;
	return (
		<Badge
			status="neutral"
			data-test="thread-owner"
			data-owner={!owner ? "unassigned" : owner.id === userId ? "mine" : "other"}
		>
			{!owner ? t("owner.unassigned") : owner.id === userId ? t("owner.mine") : owner.name}
		</Badge>
	);
}

/**
 * The pipe, who holds the thread (a manager's, ADR 0022) and the turn plate, on the thread
 * header. An open thread shows no owner flag: the owner select already says whose it is (#303).
 */
export function ThreadFlags({
	conversation,
	owner = true,
	size = "md",
	pipeIconOnly = false,
}: {
	conversation: Pick<
		ConversationSummary,
		"pipe" | "owner" | "unansweredInboundId" | "crm" | "lastGuestInboundAt"
	>;
	/** Whether the owner flag may show; something else on screen already says it (#303). */
	owner?: boolean;
	size?: "md" | "lg";
	/** The pipe as its glyph alone (`PipeLabel`'s `iconOnly`), where the header has no room. */
	pipeIconOnly?: boolean;
}) {
	return (
		<>
			<PipeLabel
				pipe={conversation.pipe}
				size={size === "lg" ? "md" : "sm"}
				iconOnly={pipeIconOnly}
			/>
			{owner ? <OwnerFlag conversation={conversation} /> : null}
			<TurnPlate conversation={conversation} size={size} />
		</>
	);
}

/** Each tag tone as its fill and text, written out whole so Tailwind can see them. */
const TAG_TONE = {
	violet: "bg-tag-violet text-tag-violet-foreground",
	teal: "bg-tag-teal text-tag-teal-foreground",
	rose: "bg-tag-rose text-tag-rose-foreground",
	amber: "bg-tag-amber text-tag-amber-foreground",
	berry: "bg-tag-berry text-tag-berry-foreground",
	lagoon: "bg-tag-lagoon text-tag-lagoon-foreground",
	sage: "bg-tag-sage text-tag-sage-foreground",
	moss: "bg-tag-moss text-tag-moss-foreground",
	plain: "bg-tag-plain text-tag-plain-foreground",
} as const satisfies Record<TagTone, string>;

/**
 * A fact tag (DESIGN.md, Fact Tags): a small squared label in one of the muted tag colours.
 * `wrap` lets a long value (an unsupported language's note) wrap in the details.
 */
export function FactTag({
	tone,
	wrap = false,
	children,
}: {
	tone: TagTone;
	wrap?: boolean;
	children: ReactNode;
}) {
	return (
		<span
			className={cn(
				"px-1 text-micro font-semibold rounded-sm",
				wrap
					? "py-0.5 leading-snug inline box-decoration-clone"
					: "h-4.5 inline-flex shrink-0 items-center leading-none whitespace-nowrap",
				TAG_TONE[tone],
			)}
		>
			{children}
		</span>
	);
}

/** Each area tone as its text and outline, written out whole so Tailwind can see them. */
const AREA_TONE = {
	copper: "text-area-copper border-area-copper/45",
	cocoa: "text-area-cocoa border-area-cocoa/45",
	pine: "text-area-pine border-area-pine/45",
	plum: "text-area-plum border-area-plum/45",
	steel: "text-area-steel border-area-steel/45",
	olive: "text-area-olive border-area-olive/45",
} as const satisfies Record<AreaTone, string>;

/**
 * An area tag (DESIGN.md, Fact Tags): the same squared size as a fact tag, but drawn as an
 * outline with a pin in the areas' own palette, so an area never reads as a language.
 */
export function AreaTag({ area }: { area: string }) {
	return (
		<span
			className={cn(
				"h-4.5 px-1 text-micro font-semibold gap-0.5 inline-flex shrink-0 items-center rounded-sm border bg-card leading-none whitespace-nowrap",
				AREA_TONE[areaTone(area)],
			)}
		>
			<MapPinIcon aria-hidden="true" className="size-2.5 shrink-0" strokeWidth={2.5} />
			{area}
		</span>
	);
}

/** Whether a stored fact is there to show. */
function known(value: string | null | undefined): value is string {
	return typeof value === "string" && value.trim() !== "";
}

/**
 * A row's fact tags (#314), under its preview: the guest's language, then the area, beds or
 * household, and budget when the qualification has them. A fact Nhịp doesn't have shows no tag.
 * Each value keeps one colour everywhere (`fact-tags.ts`); beds and budget stay plain.
 */
export function FactTags({
	conversation,
}: {
	conversation: Pick<ConversationSummary, "guestLanguage" | "facts">;
}) {
	const t = useTranslations("inbox");
	const locale = useLocale();
	const code = conversation.guestLanguage;
	const facts = conversation.facts;
	const detail = (id: "beds" | "budget", raw: string) =>
		formatGuestDetail(id, raw, locale, (key, values) => t(key, values));
	return (
		<>
			{code ? (
				<FactTag tone={languageTone(code)}>
					{languageName(code, locale, (language) => t(`guestLanguage.${language}`))}
				</FactTag>
			) : null}
			{known(facts?.area) ? <AreaTag area={facts.area} /> : null}
			{known(facts?.beds) ? <FactTag tone="plain">{detail("beds", facts.beds)}</FactTag> : null}
			{known(facts?.budget) ? (
				<FactTag tone="plain">{detail("budget", facts.budget)}</FactTag>
			) : null}
		</>
	);
}

/** A centred sentence for a column with nothing to show, with an optional action under it. */
export function ThreadListState({
	title,
	action,
	testId,
}: {
	title: string;
	action?: ReactNode;
	/** For E2E: which state this is, independent of its wording. */
	testId?: string;
}) {
	return (
		<div
			className="px-4 py-10 flex flex-col items-center justify-center text-center"
			data-test={testId}
		>
			<p className="text-sm max-w-empty-note text-pretty text-muted-foreground">{title}</p>
			{action}
		</div>
	);
}
