#!/usr/bin/env node
// Splits the SaaS E2E spec files into N lists of about equal run time, for CI's shards (#278).
// Playwright's own --shard splits by test count in file order, which put the two longest files
// (alerts-in-app, assign) on one shard; this packs whole files by their measured seconds.
//
//   node scripts/e2e-shard-lists.mjs --shards 2 --out <dir>
//       writes <dir>/shard-1.txt … shard-N.txt for `playwright test --test-list <file>`
//   node scripts/e2e-shard-lists.mjs --update <results.json> [<results.json> …]
//       rewrites apps/saas/tests/e2e-timings.json from Playwright JSON reports (CI's artifacts)
//
// A spec file missing from the timings counts as the median file. Each list starts with the
// setup file, so every shard mints its own sessions.
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const testDir = path.join(root, "apps/saas/tests");
const timingsFile = path.join(testDir, "e2e-timings.json");
const SETUP = "sessions.setup.ts";

const args = process.argv.slice(2);
const option = (name) => {
	const at = args.indexOf(name);
	return at === -1 ? undefined : args[at + 1];
};

if (args[0] === "--update") {
	const seconds = {};
	const walk = (suite, file) => {
		const here = suite.file ?? file;
		for (const spec of suite.specs ?? []) {
			for (const test of spec.tests) {
				for (const result of test.results) {
					seconds[here] = (seconds[here] ?? 0) + result.duration / 1000;
				}
			}
		}
		for (const child of suite.suites ?? []) {
			walk(child, here);
		}
	};
	for (const report of args.slice(1)) {
		for (const suite of JSON.parse(fs.readFileSync(report, "utf8")).suites) {
			walk(suite);
		}
	}
	delete seconds[SETUP];
	const sorted = Object.fromEntries(
		Object.entries(seconds)
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([file, s]) => [file, Math.round(s * 10) / 10]),
	);
	fs.writeFileSync(timingsFile, `${JSON.stringify(sorted, null, "\t")}\n`);
	console.log(
		`Wrote ${Object.keys(sorted).length} files' seconds to ${path.relative(root, timingsFile)}`,
	);
	process.exit(0);
}

const shards = Number(option("--shards"));
const out = option("--out");
if (!Number.isInteger(shards) || shards < 1 || !out) {
	console.error("usage: e2e-shard-lists.mjs --shards <n> --out <dir> | --update <results.json>…");
	process.exit(2);
}

const timings = fs.existsSync(timingsFile) ? JSON.parse(fs.readFileSync(timingsFile, "utf8")) : {};
const files = fs
	.readdirSync(testDir)
	.filter((file) => file.endsWith(".spec.ts"))
	.sort();
const known = files
	.map((file) => timings[file])
	.filter((s) => typeof s === "number")
	.sort((a, b) => a - b);
const median = known.length ? known[Math.floor(known.length / 2)] : 1;

// Longest first, each onto the lightest shard so far.
const bins = Array.from({ length: shards }, () => ({ seconds: 0, files: [] }));
for (const file of [...files].sort(
	(a, b) => (timings[b] ?? median) - (timings[a] ?? median) || a.localeCompare(b),
)) {
	const lightest = bins.reduce((min, bin) => (bin.seconds < min.seconds ? bin : min));
	lightest.files.push(file);
	lightest.seconds += timings[file] ?? median;
}

fs.mkdirSync(out, { recursive: true });
bins.forEach((bin, index) => {
	const list = path.join(out, `shard-${index + 1}.txt`);
	fs.writeFileSync(
		list,
		[SETUP, ...bin.files.sort((a, b) => a.localeCompare(b))].join("\n") + "\n",
	);
	console.log(
		`shard ${index + 1}/${shards}: ${bin.files.length} files, ~${Math.round(bin.seconds)} test-s`,
	);
});
