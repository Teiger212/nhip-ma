/**
 * HTTPS in front of the E2E production build (AGENTS.md, "Test quality"), so the app runs
 * as it does when hosted: an https URL, secure cookies, no HTTP exception in the app.
 * A throwaway self-signed certificate for localhost is made at start (openssl), read into
 * memory, and its temp folder deleted at once, so a proxy killed without a signal leaves nothing
 * behind; Playwright trusts it with ignoreHTTPSErrors. Headers pass through as sent,
 * including each test's own x-forwarded-for (support/session.ts, clientIpHeaders).
 *
 *   node tests/support/https-proxy.mjs <httpsPort> <targetPort>
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";

const [httpsPort = "3443", targetPort = "3000"] = process.argv.slice(2);
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nhip-e2e-tls-"));
const key = path.join(dir, "key.pem");
const cert = path.join(dir, "cert.pem");
execFileSync(
	"openssl",
	[
		"req",
		"-x509",
		"-newkey",
		"rsa:2048",
		"-nodes",
		"-days",
		"2",
		"-subj",
		"/CN=localhost",
		"-addext",
		"subjectAltName=DNS:localhost,IP:127.0.0.1",
		"-keyout",
		key,
		"-out",
		cert,
	],
	{ stdio: "ignore" },
);

const tls = { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
fs.rmSync(dir, { recursive: true, force: true });

const server = https.createServer(tls, (req, res) => {
	const upstream = http.request(
		{
			host: "127.0.0.1",
			port: Number(targetPort),
			method: req.method,
			path: req.url,
			headers: {
				...req.headers,
				"x-forwarded-proto": "https",
				"x-forwarded-host": req.headers.host,
			},
		},
		(upstreamRes) => {
			res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
			upstreamRes.pipe(res);
		},
	);
	upstream.on("error", () => {
		if (!res.headersSent) res.writeHead(502);
		res.end();
	});
	req.pipe(upstream);
});

server.listen(Number(httpsPort), () => {
	console.info(`e2e https proxy: https://localhost:${httpsPort} -> http://127.0.0.1:${targetPort}`);
});
for (const signal of ["SIGINT", "SIGTERM"]) {
	process.on(signal, () => {
		server.close();
		process.exit(0);
	});
}
