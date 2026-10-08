import type { InboundEvent, InboxStore, Pipe } from "@repo/database/inbox";

import { encryptSecret, tokenContext } from "./pipes/secrets";
import { testDb } from "./test-store";

/**
 * Builders the `*.db.test.ts` files share (#223), so a change to a guest message, an Answer or
 * a membership is made once. Each takes overrides for what a test asserts on; every default is
 * a plain fixed value, so assertions stay readable and repeatable.
 */

/** A thread as the helpers act on it: its office and its (opaque) id. */
export type Thread = { officeId: string; id: string };

/** A guest's message as a pipe delivers it: Zalo, from the guest, unnamed, "Xin chào", no vendor id. */
export function guestMessage(guestId: string, overrides: Partial<InboundEvent> = {}): InboundEvent {
	return {
		pipe: "zalo",
		source: "guest",
		guestId,
		guestName: null,
		text: "Xin chào",
		vendorMessageId: null,
		...overrides,
	};
}

/** The guest's thread at `officeId`, found as the store finds it: by (office, pipe, guest). */
export async function threadOf(
	officeId: string,
	guestId: string,
	pipe: Pipe = "zalo",
): Promise<Thread> {
	return testDb.conversation.findUniqueOrThrow({
		where: { officeId_pipe_guestId: { officeId, pipe, guestId } },
		select: { officeId: true, id: true },
	});
}

/** The id of the thread's latest guest message. */
export async function lastInboundId(store: InboxStore, { officeId, id }: Thread): Promise<string> {
	const conversation = await store.getOfficeConversation(officeId, id);
	const message = conversation?.messages.filter((m) => m.direction === "in").at(-1);
	if (!message) throw new Error(`no guest message on ${id}`);
	return message.id;
}

let sends = 0;

/**
 * Approve a guest message and settle the Answer as the vendor would (ADR 0011): delivered
 * (`sent`, a mock send unless `mock` is false, with a vendor id unique to this send), refused
 * (`failed`), gone silent (`unknown`), or still `sending`. Returns the Answer's id.
 */
export async function answer(
	store: InboxStore,
	input: {
		officeId: string;
		conversationId: string;
		inboundId: string;
		text?: string;
		operatorId?: string | null;
	},
	{
		outcome = "sent",
		mock = true,
		reason = outcome === "failed" ? "vendor refused" : "timeout",
	}: { outcome?: "sent" | "failed" | "unknown" | "sending"; mock?: boolean; reason?: string } = {},
): Promise<string> {
	const { officeId } = input;
	const begun = await store.beginAnswer({
		text: "Reply",
		operatorId: "agent-1",
		...input,
	});
	if (!begun.ok) throw new Error(`beginAnswer: ${begun.reason}`);
	const answerId = begun.answer.id;
	if (outcome === "sent") {
		await store.completeAnswer(officeId, answerId, {
			mock,
			pipe: "zalo",
			vendorMessageId: `vendor-${++sends}`,
		});
	}
	if (outcome === "failed") await store.failAnswer(officeId, answerId, reason);
	if (outcome === "unknown") await store.markAnswerUnknown(officeId, answerId, reason);
	return answerId;
}

/**
 * A person: a user named by their id, at `<id>@test.nhip.local`, with `role` as their platform
 * role (null for none). The fixture operators exist already; this sets their role.
 */
export async function account(
	id: string,
	{ role = null, at = new Date() }: { role?: string | null; at?: Date } = {},
): Promise<void> {
	await testDb.user.upsert({
		where: { id },
		create: {
			id,
			name: id,
			email: `${id}@test.nhip.local`,
			emailVerified: true,
			role,
			createdAt: at,
			updatedAt: at,
		},
		update: { role },
	});
}

/** `userId` is a member of `officeId` as `role` (the kit's `owner`, `admin` or `member`). */
export async function membership(
	officeId: string,
	userId: string,
	role: string,
	{ at = new Date() }: { at?: Date } = {},
): Promise<void> {
	await testDb.member.upsert({
		where: { organizationId_userId: { organizationId: officeId, userId } },
		create: {
			id: `m-${officeId}-${userId}`,
			organizationId: officeId,
			userId,
			role,
			createdAt: at,
		},
		update: { role },
	});
}

/** The deployment's key for sealed pipe and CRM tokens (ADR 0017), as `PIPE_SECRETS_KEY` holds it. */
export const TEST_SECRETS_KEY = Buffer.alloc(32, 7).toString("base64");

/**
 * The office's Zalo OA, connected with tokens good for a day and sealed under
 * `TEST_SECRETS_KEY` (setup, not the flow). `officeId` claims the OA for that office first;
 * `disconnected` leaves it as a refused refresh does.
 */
export async function connectZaloOa(
	store: InboxStore,
	oaId: string,
	{ officeId, disconnected = false }: { officeId?: string; disconnected?: boolean } = {},
): Promise<void> {
	if (officeId) await store.claimPipe({ pipe: "zalo", externalId: oaId, officeId });
	await store.savePipeCredential("zalo", oaId, {
		accessToken: encryptSecret("access-1", TEST_SECRETS_KEY, tokenContext("zalo", oaId, "access")),
		refreshToken: encryptSecret(
			"refresh-1",
			TEST_SECRETS_KEY,
			tokenContext("zalo", oaId, "refresh"),
		),
		accessTokenExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
	});
	if (disconnected) await store.markPipeDisconnected("zalo", oaId, "refresh refused");
}

/** A thread's link in the inbox, as the CRM sync is handed it. */
export const threadUrl = (id: string) =>
	`https://nhip.test/vi/inbox?thread=${encodeURIComponent(id)}`;

/* ---------------------------------------------------------- calling the app's route handlers */

/** The session the mocked `auth.api.getSession` returns in the route tests: the walk office's manager. */
export const DEMO_SESSION = {
	session: { id: "walk-session", activeOrganizationId: "walk-office" },
	user: { id: "walk-user" },
};

export type Body = Record<string, unknown>;

/** A route's response with its JSON body read (an empty object when there is none). */
export async function json(res: Response): Promise<{ res: Response; status: number; body: Body }> {
	const body = (await res.json().catch(() => ({}))) as Body;
	return { res, status: res.status, body };
}

/** The `params` a dynamic route handler is handed for `[id]`. */
export function params(id: string): { params: Promise<{ id: string }> } {
	return { params: Promise.resolve({ id }) };
}

/** A JSON POST; a string body is sent as it is, so a test can send malformed JSON. */
export function post(url: string, body: unknown): Request {
	return new Request(url, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: typeof body === "string" ? body : JSON.stringify(body),
	});
}
