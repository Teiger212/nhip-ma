import { askState } from "./state-client";

/** How many guests one state call writes: each call answers well within its 10 s. */
const PER_CALL = 25;

/**
 * Guests who each wrote once to the office's Zalo OA (`connectZaloOa` first), written straight
 * into the inbox store as setup (`guest-state.ts`, #222), not one signed webhook each: for a
 * spec about many threads, not about a message arriving. `assigned`: given to `ownerId`;
 * `answered`: given to `ownerId`, who replied.
 */
export async function seedZaloGuests(
	officeId: string,
	oaId: string,
	guestIds: string[],
	then: { fate: "unassigned" } | { fate: "assigned" | "answered"; ownerId: string },
): Promise<void> {
	const ownerId = then.fate === "unassigned" ? "" : then.ownerId;
	for (let i = 0; i < guestIds.length; i += PER_CALL) {
		await askState(
			"guests.seed",
			officeId,
			oaId,
			then.fate,
			ownerId,
			...guestIds.slice(i, i + PER_CALL),
		);
	}
}
