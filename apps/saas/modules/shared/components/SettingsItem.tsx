import { cn } from "@repo/ui";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@repo/ui/components/card";
import type { PropsWithChildren, ReactNode } from "react";

/**
 * A settings card. Inside a `SettingsList` (its `settings` container) at 42rem and up it is a
 * row: title and description on the left third, the control on the right. Anywhere else, such
 * as the admin area's office page, it stacks like the cards beside it. The title is the Title
 * role (`CardTitle`), as on every card.
 */
export function SettingsItem({
	children,
	title,
	description,
	danger,
}: PropsWithChildren<{
	title: string | ReactNode;
	description?: string | ReactNode;
	danger?: boolean;
}>) {
	return (
		<Card className="@container">
			<div className="@2xl/settings:grid @2xl/settings:grid-cols-setting @2xl/settings:gap-8">
				<CardHeader className="@2xl/settings:pb-6">
					<CardTitle>
						<span className={cn(danger && "text-destructive")}>{title}</span>
					</CardTitle>
					{description && <CardDescription>{description}</CardDescription>}
				</CardHeader>
				<CardContent className="@2xl/settings:pt-6">{children}</CardContent>
			</div>
		</Card>
	);
}
