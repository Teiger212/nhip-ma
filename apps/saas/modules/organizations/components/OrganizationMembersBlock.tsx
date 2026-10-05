"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@repo/ui/components/tabs";
import { SettingsItem } from "@shared/components/SettingsItem";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { OrganizationInvitationsList } from "./OrganizationInvitationsList";
import { OrganizationMembersList } from "./OrganizationMembersList";

export function OrganizationMembersBlock({
	organizationId,
	lockOwnRow,
}: {
	organizationId: string;
	/** No Leave and no role change on your own row (Team, #82; ADR 0013). */
	lockOwnRow?: boolean;
}) {
	const t = useTranslations();
	const [activeTab, setActiveTab] = useState("members");

	return (
		<SettingsItem
			title={t("organizations.settings.members.people")}
			description={t("organizations.settings.members.description")}
		>
			<Tabs value={activeTab} onValueChange={(tab) => setActiveTab(tab)}>
				<TabsList className="mb-4 max-w-full overflow-x-auto">
					<TabsTrigger value="members">
						{t("organizations.settings.members.activeMembers")}
					</TabsTrigger>
					<TabsTrigger value="invitations">
						{t("organizations.settings.members.pendingInvitations")}
					</TabsTrigger>
				</TabsList>
				<TabsContent value="members">
					<OrganizationMembersList organizationId={organizationId} lockOwnRow={lockOwnRow} />
				</TabsContent>
				<TabsContent value="invitations">
					<OrganizationInvitationsList organizationId={organizationId} />
				</TabsContent>
			</Tabs>
		</SettingsItem>
	);
}
