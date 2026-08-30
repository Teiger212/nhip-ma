import fs from "node:fs";
import path from "node:path";

export const DEFAULT_SQLITE_PATH = "data/nhip.db";

function findRepoRoot(start = process.cwd()): string {
	let dir = path.resolve(start);
	while (true) {
		if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return path.resolve(start);
		}
		dir = parent;
	}
}

export function sqliteFilePath(filePath = DEFAULT_SQLITE_PATH): string {
	if (path.isAbsolute(filePath)) {
		return filePath;
	}
	return path.resolve(findRepoRoot(), filePath);
}

export function sqlitePathFromEnv(): string {
	const url = process.env.DATABASE_URL;
	if (url?.startsWith("file:")) {
		let raw = url.slice("file:".length);
		if (raw.startsWith("./")) {
			raw = raw.slice(2);
		}
		return sqliteFilePath(raw);
	}
	return sqliteFilePath(DEFAULT_SQLITE_PATH);
}
