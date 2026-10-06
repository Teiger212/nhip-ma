#!/usr/bin/env node
// Folds the changelog fragments in `changelog.d/` into CHANGELOG.md (#200), newest on top, and
// deletes them. "Newest" is the order they reached main: the first-parent log of the commits
// that added them, never their filenames. Fragments added by the same commit keep path order.
// `.github/workflows/changelog.yml` runs it on main; the format check runs `--check` on PRs.
//
// Usage, from inside the repository:
//   node scripts/changelog/fold.mjs           fold, delete the fragments, print what it did
//   node scripts/changelog/fold.mjs --check   only check that each fragment is well formed
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DIR = "changelog.d";
const HEADER = "# Changelog";
// A fragment is one section, exactly as CHANGELOG.md writes them: `## <date> (<title>)`.
const SECTION = /^## \d{4}-\d{2}-\d{2} \(.+\)$/;
const NAME = /^\d+-[a-z0-9-]+\.md$/;

function fail(message) {
	console.error(`changelog fold: ${message}`);
	process.exit(1);
}

function git(...args) {
	return execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const root = git("rev-parse", "--show-toplevel").trim();

function readFragments() {
	let names;
	try {
		names = readdirSync(join(root, DIR), { withFileTypes: true });
	} catch {
		return [];
	}
	return names
		.filter((entry) => entry.name !== "README.md")
		.map((entry) => {
			const path = `${DIR}/${entry.name}`;
			// A plain ASCII name, so git prints it as it is (a non-ASCII one comes back quoted) and
			// nothing in the folder is silently skipped.
			if (!entry.isFile() || !NAME.test(entry.name)) {
				fail(`${path} isn't a fragment: name it <issue>-<slug>.md, lowercase a-z, 0-9 and "-".`);
			}
			const text = readFileSync(join(root, path), "utf8").replace(/\r\n/g, "\n").trim();
			const lines = text.split("\n");
			if (!SECTION.test(lines[0])) {
				fail(`${path} must start with "## YYYY-MM-DD (title)" (see ${DIR}/README.md).`);
			}
			let fenced = false;
			const headings = lines.slice(1).filter((line) => {
				if (line.startsWith("```") || line.startsWith("~~~")) fenced = !fenced;
				return !fenced && /^##? /.test(line);
			});
			if (headings.length > 0) {
				fail(`${path} holds one "## " section; use "### Added", "### Fixed"… inside it.`);
			}
			return { path, text };
		});
}

// Each fragment's position: the newest first-parent commit that added it. The log runs newest
// first, so the first sighting of a path is the one that counts.
function arrivalOrder() {
	const out = git(
		"-c",
		"core.quotePath=false",
		"log",
		"--first-parent",
		"--diff-merges=first-parent",
		"--diff-filter=A",
		"--no-renames",
		"--name-only",
		"--format=%x00",
		"HEAD",
		"--",
		`${DIR}/`,
	);
	const order = new Map();
	for (const commit of out.split("\0").slice(1)) {
		const paths = commit.split("\n").filter(Boolean).sort();
		for (const path of paths) {
			if (!order.has(path)) order.set(path, order.size);
		}
	}
	return order;
}

const fragments = readFragments();

if (process.argv.includes("--check")) {
	console.log(`changelog fold: ${fragments.length} fragment(s) well formed.`);
	process.exit(0);
}

if (fragments.length === 0) {
	console.log("changelog fold: nothing to fold.");
	process.exit(0);
}

const order = arrivalOrder();
for (const { path } of fragments) {
	if (!order.has(path)) fail(`${path} isn't in main's history; commit it first.`);
}
fragments.sort((a, b) => order.get(a.path) - order.get(b.path));

const changelogPath = join(root, "CHANGELOG.md");
const changelog = readFileSync(changelogPath, "utf8").replace(/\r\n/g, "\n");
if (!changelog.startsWith(`${HEADER}\n`)) fail(`CHANGELOG.md must start with "${HEADER}".`);
const rest = changelog.slice(HEADER.length).trim();

const sections = fragments.map((fragment) => fragment.text);
if (rest) sections.push(rest);
writeFileSync(changelogPath, `${HEADER}\n\n${sections.join("\n\n")}\n`);

for (const { path } of fragments) rmSync(join(root, path));
for (const { path } of fragments) console.log(`folded ${path}`);
