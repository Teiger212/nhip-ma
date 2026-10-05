import { execFileSync } from "node:child_process";
import path from "node:path";

/** A deletion receipt (ADR 0020): that a deletion happened, never who the guest was. */
export type GuestDeletionReceipt = {
	id: string;
	officeId: string;
	/** The manager's user id, or null once their account is gone. */
	actorId: string | null;
	/** The manager's name as it was when they deleted. */
	actorName: string;
	/** ISO time of the deletion. */
	at: string;
	/** Why the manager deleted. */
	reason: "guest_request" | "duplicate_or_spam" | "test_data" | "other";
	/** The manager's note, phone numbers and emails masked; null without one. */
	note: string | null;
	messages: number;
	/** Replies that went out. */
	answers: number;
	translations: number;
	/** Bell rows that named the thread. */
	notifications: number;
	crmKind: "mock" | "hubspot" | null;
	crmResult: "deleted" | "unlinked" | "pending" | "failed" | null;
};

/** One deleted guest who wrote in, as Home keeps counting them: no identifier, no text. */
export type LeadTally = {
	id: string;
	officeId: string;
	pipe: "zalo" | "whatsapp";
	language: string | null;
	firstInboundAt: string;
	firstReplyAt: string | null;
	inConversation: boolean;
	outcome: "open" | "won" | "lost" | null;
};

/**
 * The office's deletion receipts and lead tallies, oldest first: the platform admin reading
 * them on request. Nothing in the app shows them yet.
 */
export function guestDeletionRecords(officeId: string): {
	receipts: GuestDeletionReceipt[];
	tallies: LeadTally[];
} {
	return JSON.parse(run(["records", officeId], "pipe")) as {
		receipts: GuestDeletionReceipt[];
		tallies: LeadTally[];
	};
}

/**
 * Setup: an approved reply to the thread's waiting guest message is stuck between approve and
 * the vendor's answer (`sending`), as a slow vendor would leave it. `operatorId` is who
 * approved it (the agent's user id; omitted, nobody). Returns the release step: the vendor
 * answers and the reply is sent.
 */
export function holdReplySending(
	officeId: string,
	conversationId: string,
	operatorId?: string,
): () => void {
	const answerId = run(["hold", officeId, conversationId, operatorId ?? ""], "pipe").trim();
	return () => {
		run(["release", officeId, answerId], "inherit");
	};
}

function run(args: string[], stdout: "inherit" | "pipe"): string {
	const out = execFileSync(
		"pnpm",
		["exec", "tsx", "--tsconfig", "tsconfig.json", "tests/support/deletion-state.ts", ...args],
		{
			cwd: path.resolve(__dirname, "../.."),
			stdio: ["ignore", stdout, "inherit"],
			encoding: "utf8",
		},
	);
	return out ?? "";
}
