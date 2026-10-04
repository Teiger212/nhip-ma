import { createServer, type AddressInfo, type Server, type Socket } from "node:net";

import { afterAll, beforeAll, expect, it } from "vitest";

// #98, "The app's connections": a database that never answers (a Neon cold start or an outage)
// fails the query after the pool's connection timeout instead of hanging the function; pg's
// default timeout of 0 waits forever. A server that accepts the connection and stays silent
// stands in for it.
let server: Server;
const sockets: Socket[] = [];

beforeAll(async () => {
	server = createServer((socket) => {
		sockets.push(socket);
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const { port } = server.address() as AddressInfo;
	process.env.DATABASE_URL = `postgresql://nhip:nhip@127.0.0.1:${port}/nhip`;
});

afterAll(() => {
	for (const socket of sockets) {
		socket.destroy();
	}
	server.close();
});

it("a query to a database that never answers fails after 10 seconds instead of hanging (#98)", async () => {
	const { db } = await import("./client");
	const started = Date.now();
	await expect(db.$queryRaw`select 1`).rejects.toThrow(/timeout/i);
	const elapsed = Date.now() - started;
	expect(elapsed).toBeGreaterThanOrEqual(9_000);
	expect(elapsed).toBeLessThan(15_000);
}, 30_000);
