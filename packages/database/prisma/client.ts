import { PrismaPg } from "@prisma/adapter-pg";
import { attachDatabasePool } from "@vercel/functions";
import { Pool } from "pg";

import { PrismaClient } from "./generated/client";

// The app's pool (#98). Server-side limits (statement_timeout, idle_in_transaction_session_timeout)
// are set on the app's database role, never here: pg would send them as startup parameters, and
// Neon's pooler refuses those connections.
const prismaClientSingleton = () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not set");
	}

	const pool = new Pool({
		connectionString: process.env.DATABASE_URL,
		// pg's default, 0, waits forever: a Neon cold start or outage would hang the function.
		connectionTimeoutMillis: 10_000,
		// Vercel's advice for Fluid compute: close idle connections after a few seconds.
		idleTimeoutMillis: 5_000,
	});
	// On Fluid compute, releases idle connections before the instance suspends; a no-op elsewhere.
	attachDatabasePool(pool);

	// The adapter uses this pool only if it is the adapter's own `pg` (an instanceof check), so
	// the workspace has one `pg` (pnpm-workspace.yaml, overrides).
	return new PrismaClient({ adapter: new PrismaPg(pool) });
};

declare global {
	var prisma: PrismaClient | undefined;
}

function getClient(): PrismaClient {
	if (!globalThis.prisma) {
		globalThis.prisma = prismaClientSingleton();
	}
	return globalThis.prisma;
}

export const db = new Proxy({} as PrismaClient, {
	get(_target, prop, receiver) {
		const client = getClient();
		const value = Reflect.get(client, prop, receiver);
		if (typeof value === "function") {
			return value.bind(client);
		}
		return value;
	},
});
