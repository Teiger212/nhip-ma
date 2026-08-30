import path from "node:path";

export const DEFAULT_SQLITE_PATH = "./data/nhip.db";

export function sqliteFilePath(filePath = DEFAULT_SQLITE_PATH): string {
	return path.resolve(filePath);
}

export function sqlitePathFromEnv(): string {
	const url = process.env.DATABASE_URL;
	if (url?.startsWith("file:")) {
		return url.slice("file:".length);
	}
	return DEFAULT_SQLITE_PATH;
}
