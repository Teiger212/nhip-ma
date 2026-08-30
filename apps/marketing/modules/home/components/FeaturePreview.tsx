import { dummyTeamPortraits } from "@home/lib/dummy-portraits";
import { cn } from "@repo/ui";
import { CreditCardIcon, ReceiptIcon, WalletIcon } from "lucide-react";
import type { StaticImageData } from "next/image";
import Image from "next/image";

export function FeaturePreview({ variant }: { variant: "teams" | "billing" }) {
	return (
		<div className="shadow-olive-950/25 dark:shadow-black/65 w-full overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[0_16px_48px_-28px]">
			<div className="gap-1.5 px-3 py-2.5 flex items-center border-b border-border/60">
				<span className="size-2 rounded-full bg-foreground/15" />
				<span className="size-2 rounded-full bg-foreground/10" />
				<span className="size-2 rounded-full bg-foreground/10" />
			</div>

			{variant === "teams" ? <TeamsPreview /> : <BillingPreview />}
		</div>
	);
}

function PreviewRow({
	meta,
	portrait,
	emphasized = false,
}: {
	meta: string;
	portrait: StaticImageData;
	emphasized?: boolean;
}) {
	return (
		<div
			className={cn("gap-3 px-3 py-2.5 flex items-center rounded-lg", emphasized && "bg-touch/6")}
		>
			<Image src={portrait} alt="" className="size-7 shrink-0 rounded-full object-cover" />
			<div className="min-w-0 flex-1">
				<div className="h-2 w-24 rounded-full bg-foreground/20" />
				<div className="mt-1.5 h-1.5 w-16 rounded-full bg-foreground/10" />
			</div>
			<span className="font-medium tracking-wide text-xs text-foreground/40">{meta}</span>
		</div>
	);
}

function TeamsPreview() {
	return (
		<div className="gap-6 p-4 sm:grid-cols-[7.5rem_1fr] grid grid-cols-1">
			<div className="gap-2 sm:flex hidden flex-col">
				<div className="h-2 w-16 rounded-full bg-foreground/15" />
				<div className="h-2 w-12 rounded-full bg-foreground/8" />
				<div className="h-2 w-14 rounded-full bg-foreground/8" />
				<div className="mt-3 h-2 w-10 rounded-full bg-foreground/8" />
			</div>
			<div className="gap-1 flex flex-col">
				<PreviewRow meta="Owner" portrait={dummyTeamPortraits[0]} emphasized />
				<PreviewRow meta="Admin" portrait={dummyTeamPortraits[1]} />
				<PreviewRow meta="Member" portrait={dummyTeamPortraits[2]} />
			</div>
		</div>
	);
}

function BillingPreview() {
	return (
		<div className="gap-1 p-4 flex flex-col">
			<div className="gap-3 px-3 py-3 flex items-center justify-between rounded-lg">
				<div className="gap-3 flex items-center">
					<span className="size-7 inline-flex items-center justify-center rounded-md border border-border/70 bg-muted/50 text-foreground/45">
						<WalletIcon className="size-3.5" />
					</span>
					<div>
						<div className="h-2 w-14 rounded-full bg-foreground/20" />
						<div className="mt-2 h-1.5 w-24 rounded-full bg-foreground/10" />
					</div>
				</div>
				<div className="h-2 w-10 rounded-full bg-foreground/15" />
			</div>
			<div className="gap-3 px-3 py-3 flex items-center justify-between rounded-lg bg-touch/6 ring-1 ring-touch/15">
				<div className="gap-3 flex items-center">
					<span className="size-7 inline-flex items-center justify-center rounded-md border border-touch/20 bg-touch/8 text-touch">
						<CreditCardIcon className="size-3.5" />
					</span>
					<div>
						<div className="h-2 w-12 rounded-full bg-foreground/25" />
						<div className="mt-2 h-1.5 w-28 rounded-full bg-foreground/10" />
					</div>
				</div>
				<div className="h-2 w-12 rounded-full bg-foreground/20" />
			</div>
			<div className="gap-3 px-3 py-3 flex items-center justify-between rounded-lg">
				<div className="gap-3 flex items-center">
					<span className="size-7 inline-flex items-center justify-center rounded-md border border-border/70 bg-muted/50 text-foreground/45">
						<ReceiptIcon className="size-3.5" />
					</span>
					<div>
						<div className="h-2 w-20 rounded-full bg-foreground/20" />
						<div className="mt-2 h-1.5 w-20 rounded-full bg-foreground/10" />
					</div>
				</div>
				<div className="h-2 w-16 rounded-full bg-foreground/15" />
			</div>
		</div>
	);
}
