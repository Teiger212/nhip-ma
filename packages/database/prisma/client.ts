import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/client";

const prismaClientSingleton = () => {
	if (!process.env.DATABASE_URL) {
		throw new Error("DATABASE_URL is not set");
	}

	if (process.env.DATABASE_URL.startsWith("file:")) {
		throw new Error(
			"Postgres Prisma is unused for the inbox SQLite walkthrough. Inbox data lives in packages/database/inbox.",
		);
	}

	const adapter = new PrismaPg({
		connectionString: process.env.DATABASE_URL,
	});

	return new PrismaClient({ adapter });
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
