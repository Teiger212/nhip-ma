import "server-only";
import { getActiveOrganization, getSession } from "@auth/lib/server";
import { permix, setupPermissions } from "@shared/lib/permix";
import { notFound } from "next/navigation";

/**
 * The office's settings (General, Team, Billing) are the managers' (#82, #212): anyone without
 * `organization.manage` gets the not-found page, not a read-only one. Every page under
 * `[organizationSlug]/settings/` calls this first, before it reads anything. It is not in a
 * shared layout, whose check doesn't re-run when you move between its child pages, nor in
 * `proxy.ts`, which can't read the membership. Server actions and API routes keep their own
 * checks.
 *
 * It sets up Permix for this office with the viewer's membership, so the page's later
 * `permix.check(...)` calls see the same rules.
 */
export async function requireOfficeManager(slug: string) {
	const session = await getSession();
	const organization = session ? await getActiveOrganization(slug) : null;

	if (!session || !organization) {
		notFound();
	}

	const membershipRole = organization.members.find(
		(member) => member.userId === session.user.id,
	)?.role;

	setupPermissions({ user: session.user, membershipRole });

	if (!permix.check("organization.manage")) {
		notFound();
	}

	return { session, organization };
}
