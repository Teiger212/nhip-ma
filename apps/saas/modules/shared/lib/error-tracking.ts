import "server-only";
import { PostHog } from "posthog-node";

import { scrubProperties, scrubText } from "./scrub";

/**
 * Server-side error tracking (PostHog Cloud): unhandled request errors only, scrubbed of
 * personal data before they leave (PRODUCT.md). Off unless NEXT_PUBLIC_POSTHOG_KEY is set, so
 * dev, E2E and CI never send anything. No person is identified: every server error is filed
 * under one anonymous id, with no IP.
 */
let client: PostHog | null | undefined;

function posthog(): PostHog | null {
	if (client !== undefined) return client;
	const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
	client = key
		? new PostHog(key, {
				host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
				disableGeoip: true,
				// Serverless: send each event right away rather than batching past the response.
				flushAt: 1,
				flushInterval: 0,
			})
		: null;
	return client;
}

export async function captureServerError(
	error: unknown,
	context: { path: string; method: string; routeType?: string; routePath?: string },
): Promise<void> {
	const ph = posthog();
	if (!ph) return;
	const err = error instanceof Error ? error : new Error(String(error));
	const scrubbed = new Error(scrubText(err.message));
	scrubbed.name = err.name;
	scrubbed.stack = err.stack
		?.split("\n")
		.map((line, i) => (i === 0 ? `${err.name}: ${scrubText(err.message)}` : line))
		.join("\n");
	try {
		await ph.captureExceptionImmediate(
			scrubbed,
			"nhip-server",
			scrubProperties({
				path: context.path,
				method: context.method,
				routeType: context.routeType,
				route: context.routePath,
				environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
			}) as Record<string, unknown>,
		);
	} catch (sendError) {
		console.error("[error-tracking] could not report an error", sendError);
	}
}
