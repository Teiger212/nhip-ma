import fs from "node:fs";
import path from "node:path";

// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
import { config as i18nConfig } from "@repo/i18n";
import dotenv from "dotenv";
import type { NextConfig } from "next";
import nextIntlPlugin from "next-intl/plugin";

function repoRootFromCwd(): string {
	let dir = process.cwd();
	while (true) {
		if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
			return dir;
		}
		const parent = path.dirname(dir);
		if (parent === dir) {
			return process.cwd();
		}
		dir = parent;
	}
}

const repoRoot = repoRootFromCwd();
dotenv.config({ path: path.join(repoRoot, ".env") });
// The E2E run (E2E=1) is a production build with its own env and database; it never reads
// the developer's .env.local, and anything CI sets explicitly wins over .env.e2e.
if (process.env.E2E === "1") {
	dotenv.config({ path: path.join(repoRoot, ".env.e2e") });
} else {
	dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });
}

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

// Derived from @repo/i18n's config.locales so the redirect matchers below
// can't drift from the supported locale list.
const localeAlternation = Object.keys(i18nConfig.locales).join("|");

const nextConfig: NextConfig = {
	// The browser's view of E2E=1, baked in at build: the E2E build polls the Inbox every second
	// (`inbox-queries.ts`, #222). Derived here, never set on its own, so E2E stays the one switch;
	// a production or staging deployment refuses E2E (`config.ts`).
	env: { NEXT_PUBLIC_E2E: process.env.E2E === "1" ? "1" : "" },
	experimental: {
		useTypeScriptCli: true,
	},
	transpilePackages: ["@repo/api", "@repo/auth", "@repo/database", "@repo/i18n", "@repo/ui"],
	serverExternalPackages: ["better-sqlite3"],
	images: {
		remotePatterns: [
			{
				// google profile images
				protocol: "https",
				hostname: "lh3.googleusercontent.com",
			},
			{
				// github profile images
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
		],
	},
	async redirects() {
		return [
			{
				source: "/",
				destination: "/en/inbox",
				permanent: false,
			},
			{
				source: "/settings",
				destination: "/settings/general",
				permanent: true,
			},
			{
				source: `/:locale(${localeAlternation})/settings`,
				destination: "/:locale/settings/general",
				permanent: true,
			},
			{
				source: "/:organizationSlug/settings",
				destination: "/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: `/:locale(${localeAlternation})/:organizationSlug/settings`,
				destination: "/:locale/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: "/admin",
				destination: "/admin/users",
				permanent: true,
			},
			{
				source: `/:locale(${localeAlternation})/admin`,
				destination: "/:locale/admin/users",
				permanent: true,
			},
		];
	},
	async headers() {
		return [
			{
				// The service worker (#135) is checked on every visit, so a new one takes over at once.
				source: "/sw.js",
				headers: [
					{ key: "Cache-Control", value: "no-cache" },
					{ key: "Content-Type", value: "application/javascript; charset=utf-8" },
				],
			},
		];
	},
	webpack: (config, { webpack, isServer }) => {
		config.plugins.push(
			new webpack.IgnorePlugin({
				resourceRegExp: /^pg-native$|^cloudflare:sockets$/,
			}),
		);

		if (isServer) {
			config.plugins.push(new PrismaPlugin());
		}

		return config;
	},
};

export default withNextIntl(nextConfig);
