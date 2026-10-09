import { cn } from "@repo/ui";
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@repo/ui/components/tooltip";
import { CheckIcon, ClockIcon } from "lucide-react";
import { useTranslations } from "next-intl";

export function EmailVerified({ verified, className }: { verified: boolean; className?: string }) {
	const t = useTranslations();
	return (
		<TooltipProvider delay={0}>
			<Tooltip>
				<TooltipContent>
					{verified
						? t("admin.users.emailVerified.verified")
						: t("admin.users.emailVerified.waiting")}
				</TooltipContent>
				<TooltipTrigger className={cn(className)}>
					{/* Verified reads as success (DESIGN.md, In Admin); blue stays for actions. */}
					{verified ? (
						<CheckIcon className="size-3 text-success" />
					) : (
						<ClockIcon className="size-3 text-muted-foreground" />
					)}
				</TooltipTrigger>
			</Tooltip>
		</TooltipProvider>
	);
}
