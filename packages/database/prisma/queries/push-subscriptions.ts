import { db } from "../client";

type Client = typeof db;

/** A device as the push needs it (ADR 0019): where to send and the keys to encrypt for. */
export type PushDevice = { id: string; endpoint: string; p256dh: string; auth: string };

export type NewPushSubscription = {
	userId: string;
	/** The sign-in that registers it; signing out there deletes it. */
	sessionId: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	userAgent: string | null;
	/** When it registers; now unless a test says otherwise. */
	at?: Date;
};

/** How many devices one operator keeps (#134, Q2); a new one past it drops the oldest. */
export const DEVICES_PER_USER = 10;

const device = { id: true, endpoint: true, p256dh: true, auth: true } as const;

/**
 * What registering a device came to: `added` (stored, or moved here), `taken` (the endpoint is
 * another operator's and this request lacks that browser's keys: 409, #135), or `signed_out`
 * (the sign-in ended before the device was stored: nothing is kept, 401).
 */
export type AddPushSubscriptionOutcome = "added" | "taken" | "signed_out";

/**
 * Register a device for the signed-in operator. An endpoint is one browser, so an endpoint this
 * operator already holds (an earlier sign-in) moves to this sign-in, and one another operator
 * holds moves here only with proof of possession: the same `p256dh` and `auth`, as that same
 * browser re-registering gives (a shared phone that changed hands, #134 Q1); its old holder
 * then gets nothing more on it. Knowing an endpoint without its keys moves nothing (#135). A
 * moved endpoint counts as new, so the cap keeps it; past `DEVICES_PER_USER`, the operator's
 * oldest go.
 *
 * The sign-in is held `FOR SHARE` until this commits, so a sign-out's session delete waits for
 * it and its after-hook then removes the device; a sign-in already gone stores nothing. One
 * registration of an endpoint at a time (an advisory lock), so two operators racing for one
 * endpoint can't both pass the check.
 */
export async function addPushSubscription(
	{ at = new Date(), ...subscription }: NewPushSubscription,
	client: Client = db,
): Promise<AddPushSubscriptionOutcome> {
	return client.$transaction(async (tx) => {
		const live = await tx.$queryRaw<{ id: string }[]>`
			SELECT "id" FROM "session"
			WHERE "id" = ${subscription.sessionId} AND "userId" = ${subscription.userId}
			FOR SHARE`;
		if (live.length === 0) return "signed_out";
		const lockKey = `push-endpoint:${subscription.endpoint}`;
		await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}::text))`;
		const held = await tx.pushSubscription.findUnique({
			where: { endpoint: subscription.endpoint },
			select: { userId: true, p256dh: true, auth: true },
		});
		if (
			held &&
			held.userId !== subscription.userId &&
			(held.p256dh !== subscription.p256dh || held.auth !== subscription.auth)
		) {
			return "taken";
		}
		await tx.pushSubscription.upsert({
			where: { endpoint: subscription.endpoint },
			create: { ...subscription, createdAt: at },
			update: { ...subscription, createdAt: at, lastSuccessAt: null },
		});
		const beyond = await tx.pushSubscription.findMany({
			where: { userId: subscription.userId },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			skip: DEVICES_PER_USER,
			select: { id: true },
		});
		if (beyond.length > 0) {
			await tx.pushSubscription.deleteMany({ where: { id: { in: beyond.map((row) => row.id) } } });
		}
		return "added";
	});
}

/** Every device of the operator: where their alerts go. */
export async function pushSubscriptionsForUser(
	userId: string,
	client: Client = db,
): Promise<PushDevice[]> {
	return client.pushSubscription.findMany({
		where: { userId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: device,
	});
}

/** The devices this sign-in registered ("this device", the test alert's target). */
export async function pushSubscriptionsForSession(
	userId: string,
	sessionId: string,
	client: Client = db,
): Promise<PushDevice[]> {
	return client.pushSubscription.findMany({
		where: { userId, sessionId },
		orderBy: [{ createdAt: "asc" }, { id: "asc" }],
		select: device,
	});
}

/** Signing out there, or turning alerts off: the sign-in's devices go. Returns how many. */
export async function deletePushSubscriptionsForSession(
	sessionId: string,
	client: Client = db,
): Promise<number> {
	const { count } = await client.pushSubscription.deleteMany({ where: { sessionId } });
	return count;
}

/** The push service said the operator's device is gone (404 or 410). */
export async function deletePushSubscription(
	id: string,
	userId: string,
	client: Client = db,
): Promise<void> {
	await client.pushSubscription.deleteMany({ where: { id, userId } });
}

/** The push service accepted a push for the operator's device. */
export async function markPushSubscriptionDelivered(
	id: string,
	userId: string,
	at: Date,
	client: Client = db,
): Promise<void> {
	await client.pushSubscription.updateMany({ where: { id, userId }, data: { lastSuccessAt: at } });
}
