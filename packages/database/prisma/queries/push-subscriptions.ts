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
 * Register a device for the signed-in operator. An endpoint is one browser, so an endpoint
 * already held by anyone (another user after a shared phone changed hands, or this user's
 * earlier sign-in) moves to this user and session in one upsert on the unique endpoint, and its
 * old holder gets nothing more on it (#134, Q1). It counts as new, so the cap keeps it. Past
 * `DEVICES_PER_USER`, the operator's oldest go.
 */
export async function addPushSubscription(
	{ at = new Date(), ...subscription }: NewPushSubscription,
	client: Client = db,
): Promise<void> {
	await client.$transaction(async (tx) => {
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

/** The push service said the device is gone (404 or 410). */
export async function deletePushSubscription(id: string, client: Client = db): Promise<void> {
	await client.pushSubscription.deleteMany({ where: { id } });
}

/** The push service accepted a push for the device. */
export async function markPushSubscriptionDelivered(
	id: string,
	at: Date,
	client: Client = db,
): Promise<void> {
	await client.pushSubscription.updateMany({ where: { id }, data: { lastSuccessAt: at } });
}
