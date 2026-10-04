import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { Client } from "pg";
import { afterAll, expect, it } from "vitest";

// #98, "A lock timeout on migrations": a migration that waits on a lock queues every request
// behind it. Hosted builds run scripts/migrate-deploy.sh, which sets lock_timeout on the
// connection, so a blocked migration fails fast, the build fails, and the previous deployment
// keeps serving (apps/saas/scripts/vercel-build.sh).
const packageDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const server = new URL(
	process.env.TEST_DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/supastarter_test",
);
const scratchDatabases: string[] = [];

function urlFor(database: string, search = "") {
	const url = new URL(server);
	url.pathname = `/${database}`;
	url.search = search;
	return url.toString();
}

async function withAdmin<T>(run: (client: Client) => Promise<T>) {
	const client = new Client({ connectionString: urlFor("postgres") });
	await client.connect();
	try {
		return await run(client);
	} finally {
		await client.end();
	}
}

/** A fresh database with the table the fixture migration alters. */
async function scratchDatabase() {
	const name = `nhip_lock_${process.pid}_${scratchDatabases.length}`;
	await withAdmin(async (admin) => {
		await admin.query(`drop database if exists ${name}`);
		await admin.query(`create database ${name}`);
	});
	scratchDatabases.push(name);
	const client = new Client({ connectionString: urlFor(name) });
	await client.connect();
	await client.query(
		'create schema "locked"; create table "locked"."guest" ("id" text primary key)',
	);
	await client.end();
	return name;
}

/** An open transaction that has read the table: the migration's ALTER waits behind it. */
async function holdLock(database: string) {
	const client = new Client({ connectionString: urlFor(database) });
	await client.connect();
	await client.query("begin");
	await client.query('select * from "locked"."guest"');
	return async () => {
		await client.query("rollback");
		await client.end();
	};
}

function migrateDeploy(databaseUrl: string) {
	const started = Date.now();
	const child = spawn(
		"./scripts/migrate-deploy.sh",
		["--config", "scripts/fixtures/lock/prisma.config.ts"],
		{ cwd: packageDir, env: { ...process.env, DATABASE_URL: databaseUrl } },
	);
	let output = "";
	child.stdout.on("data", (chunk) => (output += chunk));
	child.stderr.on("data", (chunk) => (output += chunk));
	return new Promise<{ code: number | null; output: string; elapsed: number }>((done) =>
		child.on("close", (code) => done({ code, output, elapsed: Date.now() - started })),
	);
}

afterAll(async () => {
	await withAdmin(async (admin) => {
		for (const name of scratchDatabases) {
			await admin.query(`drop database if exists ${name} with (force)`);
		}
	});
});

it("a migration blocked by an open transaction fails within the lock timeout, failing the build (#98)", async () => {
	const database = await scratchDatabase();
	const release = await holdLock(database);
	try {
		const { code, output, elapsed } = await migrateDeploy(urlFor(database));
		expect(output).toContain("lock timeout");
		expect(code).not.toBe(0);
		expect(elapsed).toBeLessThan(15_000);
	} finally {
		await release();
	}
}, 60_000);

it("keeps the options a direct URL already carries, and still times out (#98)", async () => {
	const database = await scratchDatabase();
	const release = await holdLock(database);
	const applicationName = `nhip_lock_test_${process.pid}`;
	let seenWaiting = false;
	const watcher = new Client({ connectionString: urlFor(database) });
	await watcher.connect();
	try {
		const run = migrateDeploy(
			urlFor(database, `?options=${encodeURIComponent(`-c application_name=${applicationName}`)}`),
		);
		let finished = false;
		void run.then(() => (finished = true));
		while (!finished && !seenWaiting) {
			const { rows } = await watcher.query(
				"select 1 from pg_stat_activity where application_name = $1 and wait_event_type = 'Lock'",
				[applicationName],
			);
			seenWaiting = rows.length > 0;
			await new Promise((wait) => setTimeout(wait, 200));
		}
		const { code, output } = await run;
		expect(seenWaiting).toBe(true);
		expect(output).toContain("lock timeout");
		expect(code).not.toBe(0);
	} finally {
		await watcher.end();
		await release();
	}
}, 60_000);
