import type { MetadataRoute } from "next";

/**
 * Nhịp installs as an app (ADR 0019, #135): standalone, opening on the Inbox. An iPhone gets web
 * push only from the Home Screen, so this is what makes alerts possible there. Served at
 * `/manifest.webmanifest`, which the locale proxy leaves alone (its matcher skips dotted paths).
 */
export default function manifest(): MetadataRoute.Manifest {
	return {
		name: "Nhịp",
		short_name: "Nhịp",
		description: "Every guest answered in minutes.",
		id: "/inbox",
		start_url: "/inbox",
		scope: "/",
		display: "standalone",
		// Desk Canvas (DESIGN.md), under the status bar and the splash.
		background_color: "#f2f5fb",
		theme_color: "#f2f5fb",
		icons: [
			{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
			{ src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
			{
				src: "/icons/icon-maskable-512.png",
				sizes: "512x512",
				type: "image/png",
				purpose: "maskable",
			},
		],
	};
}
