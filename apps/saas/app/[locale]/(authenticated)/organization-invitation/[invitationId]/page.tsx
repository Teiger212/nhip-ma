import { OrganizationInvitationModal } from "@organizations/components/OrganizationInvitationModal";
import { requireSession } from "@organizations/lib/require-session";
import { auth } from "@repo/auth";
import { getOrganizationById } from "@repo/database";
import { AuthWrapper } from "@shared/components/AuthWrapper";
import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export async function generateMetadata() {
	const t = await getTranslations("organizations.invitationModal");

	return {
		title: t("title"),
	};
}

export default async function OrganizationInvitationPage({
	params,
}: {
	params: Promise<{ invitationId: string }>;
}) {
	// Signed in, checked here and not only by the layout (#231), before the invitation is read.
	await requireSession();
	const { invitationId } = await params;

	const invitation = await auth.api.getInvitation({
		query: {
			id: invitationId,
		},
		headers: await headers(),
	});

	if (!invitation) {
		redirect("/");
	}

	const organization = await getOrganizationById(invitation.organizationId);

	return (
		<AuthWrapper>
			<OrganizationInvitationModal
				organizationName={invitation.organizationName}
				organizationSlug={invitation.organizationSlug}
				logoUrl={organization?.logo || undefined}
				invitationId={invitationId}
			/>
		</AuthWrapper>
	);
}
