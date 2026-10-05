/**
 * A manager gives a lead to an agent (ADR 0022, "Assigning"): setup for a spec whose agent opens,
 * counts or answers a new guest, who otherwise waits in Unassigned where only managers see them.
 */
import { expect } from "@playwright/test";

import { MANAGER } from "./seed";
import type { Api } from "./session";
import { apiAs } from "./session";

/** The signed-in person's own user id, as their session reads it. */
export async function userIdOf(api: Api): Promise<string> {
	const res = await api.get("/api/auth/get-session");
	expect(res.status(), "the session is readable").toBe(200);
	const session = (await res.json()) as { user: { id: string } } | null;
	expect(session?.user, "someone is signed in").toBeTruthy();
	return session!.user.id;
}

/** An office's manager, who hands out its threads. */
export type Assigner = {
	/** The guest's thread id, once the manager's conversations API lists it. */
	threadOf: (guestId: string) => Promise<string>;
	/** Gives the thread to the agent through the owner API; fails the test unless it is taken. */
	assignTo: (threadId: string, agentUserId: string) => Promise<void>;
	/** Gives the guest's thread to the agent, once it is there. */
	assignGuestTo: (guestId: string, agentUserId: string) => Promise<void>;
};

/** `manager` hands out threads: an invited kit `admin` of the office (never the platform admin). */
export function assignerAs(manager: Api): Assigner {
	const threadOf = async (guestId: string) => {
		let id: string | undefined;
		await expect(async () => {
			const res = await manager.get("/api/conversations");
			expect(res.status(), "the manager lists the office's threads").toBe(200);
			id = ((await res.json()) as { id: string; guestId: string }[]).find(
				(t) => t.guestId === guestId,
			)?.id;
			expect(id, `the manager lists ${guestId}`).toBeDefined();
		}).toPass({ timeout: 10_000 });
		return id!;
	};
	const assignTo = async (threadId: string, agentUserId: string) => {
		const res = await manager.post(`/api/conversations/${encodeURIComponent(threadId)}/owner`, {
			ownerId: agentUserId,
		});
		expect(res.status(), `the manager assigns the thread: ${await res.text()}`).toBe(200);
	};
	return {
		threadOf,
		assignTo,
		assignGuestTo: async (guestId, agentUserId) => assignTo(await threadOf(guestId), agentUserId),
	};
}

/** The walk office's seeded manager hands out a thread of the walk office. Dispose it when done. */
export async function walkManager(): Promise<Assigner & { dispose: () => Promise<void> }> {
	const api = await apiAs(MANAGER);
	return { ...assignerAs(api), dispose: api.dispose };
}
