import fs from "node:fs";
import path from "node:path";

// @ts-expect-error - PrismaPlugin is not typed
import { PrismaPlugin } from "@prisma/nextjs-monorepo-workaround-plugin";
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
dotenv.config({ path: path.join(repoRoot, ".env.local"), override: true });

const withNextIntl = nextIntlPlugin("./modules/i18n/request.ts");

const nextConfig: NextConfig = {
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
				source: "/settings",
				destination: "/settings/general",
				permanent: true,
			},
			{
				source: "/:organizationSlug/settings",
				destination: "/:organizationSlug/settings/general",
				permanent: true,
			},
			{
				source: "/admin",
				destination: "/admin/users",
				permanent: true,
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
