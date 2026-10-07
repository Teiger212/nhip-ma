import { randomUUID } from "node:crypto";

import type { Locator, Page } from "@playwright/test";

import { assignerAs } from "./support/assign";
import { expect, test as base } from "./support/fixtures";
import type { Joined } from "./support/operators";
import { joinOffice } from "./support/operators";
import { connectZaloOa, releaseZaloOa } from "./support/pipes";
import { sendZaloText } from "./support/zalo";

/** The turn chip's states while a guest waits, and what each reads (English only: VI waits on #78). */
const CHIP = { yourTurn: "Your turn", waiting: "Waiting" } as const;
type Chip = keyof typeof CHIP;

/** An operator of the test's office, in a browser of their own. */
type Operator = { label: string; id: string; page: Page };

/**
 * An office of the test's own (the platform admin creates it), with a Zalo OA of its own, one
 * agent and two managers (the kit's `admin`) who accepted their invitations into it. Its guests are
 * nameless Zalo guests, listed by their Zalo id.
 */
type ChipOffice = {
	agent: Operator;
	manager: Operator;
	secondManager: Operator;
	/** A new guest writes and waits; resolves with their Zalo id once the manager lists the thread. */
	newGuest: () => Promise<string>;
	/** The manager gives the guest's thread to the operator, through the owner API (setup). */
	assign: (guestId: string, to: Operator) => Promise<void>;
};

const test = base.extend<{ office: ChipOffice }>({
	office: async ({ admin, browser, request }, use) => {
		const office = await admin.createOffice("Manager chip");
		const oaId = `e2e-chip-oa-${randomUUID()}`;
		await connectZaloOa(office.id, oaId);
		const contexts: Joined[] = [];
		try {
			const join = async (label: string, role: "member" | "admin") => {
				const joined = await joinOffice(admin, browser, office.id, role, `chip-${role}`);
				contexts.push(joined);
				const operator: Operator = { label, id: joined.userId, page: joined.page };
				return { operator, api: joined.api };
			};
			// Everyone joins at once (setup).
			const [
				{ operator: agent },
				{ operator: manager, api: managerApi },
				{ operator: secondManager },
			] = await Promise.all([
				join("agent 1", "member"),
				join("the manager", "admin"),
				join("the second manager", "admin"),
			]);
			const assigner = assignerAs(managerApi);
			await use({
				agent,
				manager,
				secondManager,
				newGuest: async () => {
					const guestId = `e2e-chip-guest-${randomUUID()}`;
					await sendZaloText(request, { guestId, oaId, text: `Hello from ${guestId}` });
					await assigner.threadOf(guestId);
					return guestId;
				},
				assign: (guestId, to) => assigner.assignGuestTo(guestId, to.id),
			});
		} finally {
			for (const context of contexts) {
				await context.close();
			}
			await releaseZaloOa(oaId);
		}
	},
});

/* ---------------------------------------------------------------- what a person sees */

/** The thread list (not the open thread). */
function threadList(page: Page): Locator {
	return page.getByRole("complementary");
}

/** The guest's row in the list. */
function rowOf(page: Page, guestId: string): Locator {
	return threadList(page).getByRole("button", { name: new RegExp(`^${guestId}\\b`) });
}

/** The open thread, its header included. */
function openThread(page: Page): Locator {
	return page.getByRole("article");
}

/** The operator finds the guest's row: the Inbox under All, searched by the guest's id. */
async function findRow(page: Page, guestId: string): Promise<Locator> {
	await page.goto("/en/inbox");
	const all = page.getByRole("button", { name: /^All \d+$/ });
	await all.click();
	await expect(all).toHaveAttribute("aria-pressed", "true");
	await page.getByRole("textbox", { name: "Search threads" }).fill(guestId);
	const row = rowOf(page, guestId);
	await expect(row).toBeVisible();
	return row;
}

/** The turn chip in `where` is in that state and reads exactly so. */
async function expectChip(where: Locator, chip: Chip, message: string) {
	const status = where.getByTestId("thread-status");
	await expect.soft(status, `${message}: data-status ${chip}`).toHaveAttribute("data-status", chip);
	await expect.soft(status, `${message}: reads "${CHIP[chip]}"`).toHaveText(CHIP[chip]);
}

/** The operator sees the chip on the guest's row and, opened from it, on the thread's header. */
async function expectChipFor(operator: Operator, guestId: string, chip: Chip, whose: string) {
	const { page } = operator;
	const row = await findRow(page, guestId);
	await expectChip(row, chip, `${operator.label}, ${whose}, on the row`);
	await row.click();
	await expect(openThread(page).getByText(`Hello from ${guestId}`, { exact: true })).toBeVisible();
	await expectChip(openThread(page), chip, `${operator.label}, ${whose}, on the thread header`);
}

// ---------------------------------------------------------------------------------------

// scenario: docs/e2e-scenarios.md Assigning leads 12 (#212; ADR 0022, amended 2026-10-06)
test.describe("Assign 12 — a manager sees Your turn only on their own threads", () => {
	test("with four guests waiting, the manager sees Your turn on their own thread and Waiting on the Unassigned one, agent 1's and the second manager's, on the row and the thread header; agent 1 and the second manager each see Your turn on theirs", async ({
		office,
	}) => {
		test.setTimeout(300_000);
		const { agent, manager, secondManager } = office;

		// Four guests write, and no one answers: one stays Unassigned, the others are given out.
		const unassigned = await office.newGuest();
		const agents = await office.newGuest();
		const secondManagers = await office.newGuest();
		const managers = await office.newGuest();
		await office.assign(agents, agent);
		await office.assign(secondManagers, secondManager);
		await office.assign(managers, manager);

		// The manager: Your turn on their own; Waiting on everyone else's, and on the Unassigned one.
		await expectChipFor(manager, managers, "yourTurn", "their own thread");
		await expectChipFor(manager, unassigned, "waiting", "the Unassigned thread");
		await expectChipFor(manager, agents, "waiting", "agent 1's thread");
		await expectChipFor(manager, secondManagers, "waiting", "the second manager's thread");

		// Agent 1 and the second manager: Your turn on their own.
		await expectChipFor(agent, agents, "yourTurn", "their own thread");
		await expectChipFor(secondManager, secondManagers, "yourTurn", "their own thread");
	});
});
