// Tests for the changelog fold (#200), against throwaway git repositories:
// `node --test scripts/changelog/`.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { after, test } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const fold = join(repoRoot, "scripts/changelog/fold.mjs");
const oxfmt = join(repoRoot, "node_modules/.bin/oxfmt");
const scratch = mkdtempSync(join(tmpdir(), "changelog-fold-"));
after(() => rmSync(scratch, { recursive: true, force: true }));

const OLD =
	"# Changelog\n\n## 2026-10-01 (an old entry)\n\n### Fixed\n\n- **Old.** It was fixed.\n";

function fragment(title, bullet) {
	return `## 2026-10-05 (${title})\n\n### Added\n\n- **${bullet}.** It works.\n`;
}

let repos = 0;
function makeRepo() {
	const dir = join(scratch, `repo-${repos++}`);
	mkdirSync(join(dir, "changelog.d"), { recursive: true });
	// Every commit gets its own second, so "written before" is real to git, not a tie.
	let clock = 1_790_000_000;
	const git = (...args) => {
		const date = `${clock++} +0700`;
		return execFileSync("git", args, {
			cwd: dir,
			encoding: "utf8",
			env: {
				...process.env,
				GIT_AUTHOR_NAME: "t",
				GIT_AUTHOR_EMAIL: "t@example.com",
				GIT_AUTHOR_DATE: date,
				GIT_COMMITTER_NAME: "t",
				GIT_COMMITTER_EMAIL: "t@example.com",
				GIT_COMMITTER_DATE: date,
			},
		});
	};
	git("init", "--quiet", "--initial-branch=main");
	writeFileSync(join(dir, "CHANGELOG.md"), OLD);
	writeFileSync(join(dir, "changelog.d/README.md"), "# Changelog fragments\n");
	git("add", ".");
	git("commit", "--quiet", "-m", "init");
	const write = (path, text) => writeFileSync(join(dir, path), text);
	const run = (...args) => spawnSync("node", [fold, ...args], { cwd: dir, encoding: "utf8" });
	const changelog = () => readFileSync(join(dir, "CHANGELOG.md"), "utf8");
	// A PR branch off main that adds one fragment, committed now and merged later.
	const branch = (name, path, text) => {
		git("checkout", "--quiet", "-b", name, "main");
		write(path, text);
		git("add", path);
		git("commit", "--quiet", "-m", `add ${path}`);
		git("checkout", "--quiet", "main");
	};
	const merge = (name) => git("merge", "--quiet", "--no-ff", "-m", `Merge ${name}`, name);
	return { dir, git, write, run, changelog, branch, merge };
}

function titles(text) {
	return [...text.matchAll(/^## \S+ \((.+)\)$/gm)].map((match) => match[1]);
}

void test("orders by when each fragment reached main, not when it was written or its name", () => {
	const repo = makeRepo();
	// Written in the order a, b, c; merged b, c, a. Neither the commit dates nor the names
	// (2, 3, 1 from the top) agree with the order they reached main.
	repo.branch("pr-a", "changelog.d/2-a.md", fragment("a: written first, merged last", "A"));
	repo.branch("pr-b", "changelog.d/1-b.md", fragment("b: merged first", "B"));
	repo.branch("pr-c", "changelog.d/3-c.md", fragment("c: merged second", "C"));
	repo.merge("pr-b");
	repo.merge("pr-c");
	repo.merge("pr-a");

	const result = repo.run();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(titles(repo.changelog()), [
		"a: written first, merged last",
		"c: merged second",
		"b: merged first",
		"an old entry",
	]);
	for (const name of ["1-b.md", "2-a.md", "3-c.md"]) {
		assert.equal(existsSync(join(repo.dir, "changelog.d", name)), false);
	}
	assert.equal(existsSync(join(repo.dir, "changelog.d/README.md")), true);
});

void test("folds several fragments from one push, including several commits pushed together", () => {
	const repo = makeRepo();
	repo.branch("pr-x", "changelog.d/20-x.md", fragment("x merged", "X"));
	repo.merge("pr-x");
	// Two commits straight onto main in one push, as a squash or rebase merge lands them.
	repo.write("changelog.d/30-direct-one.md", fragment("direct one", "D1"));
	repo.git("add", "changelog.d/30-direct-one.md");
	repo.git("commit", "--quiet", "-m", "direct one");
	repo.write("changelog.d/10-direct-two.md", fragment("direct two", "D2"));
	repo.git("add", "changelog.d/10-direct-two.md");
	repo.git("commit", "--quiet", "-m", "direct two");

	const result = repo.run();
	assert.equal(result.status, 0, result.stderr);
	assert.deepEqual(titles(repo.changelog()), [
		"direct two",
		"direct one",
		"x merged",
		"an old entry",
	]);
	assert.match(result.stdout, /folded changelog\.d\/10-direct-two\.md/);
});

void test("a fragment re-added after an earlier fold takes its latest arrival", () => {
	const repo = makeRepo();
	repo.branch("pr-1", "changelog.d/7-same.md", fragment("first life", "S"));
	repo.merge("pr-1");
	assert.equal(repo.run().status, 0);
	repo.git("add", "CHANGELOG.md", "changelog.d");
	repo.git("commit", "--quiet", "-m", "fold");
	repo.branch("pr-2", "changelog.d/9-other.md", fragment("other", "O"));
	repo.merge("pr-2");
	repo.branch("pr-3", "changelog.d/7-same.md", fragment("second life", "S2"));
	repo.merge("pr-3");

	assert.equal(repo.run().status, 0);
	assert.deepEqual(titles(repo.changelog()), [
		"second life",
		"other",
		"first life",
		"an old entry",
	]);
});

void test("nothing to fold leaves CHANGELOG.md untouched", () => {
	const repo = makeRepo();
	const result = repo.run();
	assert.equal(result.status, 0, result.stderr);
	assert.match(result.stdout, /nothing to fold/);
	assert.equal(repo.changelog(), OLD);
});

void test("the folded CHANGELOG.md passes oxfmt --check as it is written", () => {
	const repo = makeRepo();
	repo.branch("pr-a", "changelog.d/1-a.md", fragment("a", "A"));
	// A fragment with stray blank lines and CRLF line ends still folds to formatted Markdown.
	repo.branch(
		"pr-b",
		"changelog.d/2-b.md",
		`\r\n${fragment("b", "B").replace(/\n/g, "\r\n")}\r\n\r\n`,
	);
	repo.merge("pr-a");
	repo.merge("pr-b");
	assert.equal(repo.run().status, 0);

	const check = spawnSync(
		oxfmt,
		["--check", "-c", join(repoRoot, ".oxfmtrc.json"), join(repo.dir, "CHANGELOG.md")],
		{ cwd: repo.dir, encoding: "utf8" },
	);
	assert.equal(check.status, 0, `${check.stdout}${check.stderr}`);
	assert.ok(repo.changelog().startsWith("# Changelog\n\n## 2026-10-05 (b)\n\n### Added\n"));
});

void test("refuses a fragment that isn't one dated section, and folds nothing", () => {
	const repo = makeRepo();
	repo.branch("pr-ok", "changelog.d/1-ok.md", fragment("ok", "OK"));
	repo.branch("pr-bad", "changelog.d/2-bad.md", "### Added\n\n- **No section heading.**\n");
	repo.merge("pr-ok");
	repo.merge("pr-bad");

	for (const args of [[], ["--check"]]) {
		const result = repo.run(...args);
		assert.equal(result.status, 1);
		assert.match(result.stderr, /2-bad\.md must start with "## YYYY-MM-DD \(title\)"/);
	}
	assert.equal(repo.changelog(), OLD);
	assert.equal(existsSync(join(repo.dir, "changelog.d/1-ok.md")), true);
});

void test("refuses a fragment holding a second section, but not a heading inside a code block", () => {
	const repo = makeRepo();
	repo.write(
		"changelog.d/1-fenced.md",
		`${fragment("fenced", "F")}\n\`\`\`sh\n# a shell comment\n\`\`\`\n`,
	);
	assert.equal(repo.run("--check").status, 0);
	repo.write("changelog.d/2-two.md", `${fragment("one", "1")}\n${fragment("two", "2")}`);
	const result = repo.run("--check");
	assert.equal(result.status, 1);
	assert.match(result.stderr, /2-two\.md holds one "## " section/);
});

void test("refuses a fragment that isn't committed, and folds nothing", () => {
	const repo = makeRepo();
	repo.write("changelog.d/1-loose.md", fragment("loose", "L"));
	const result = repo.run();
	assert.equal(result.status, 1);
	assert.match(result.stderr, /1-loose\.md isn't in main's history/);
	assert.equal(repo.changelog(), OLD);
});
