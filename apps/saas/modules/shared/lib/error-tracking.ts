import "server-only";
import { PostHog } from "posthog-node";

import { errorKind, scrubExceptionList, scrubServerError } from "./scrub";

/**
 * Server-side error tracking (PostHog Cloud): unhandled request errors only, scrubbed of
 * personal data before they leave (PRODUCT.md). Off unless NEXT_PUBLIC_POSTHOG_KEY is set, so
 * dev, E2E and CI never send anything. No person is identified: every server error is filed
 * under one anonymous id, with no geo lookup.
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
				// The SDK builds the exception list itself (and reads source lines around each
				// frame); scrub it once more on the way out.
				before_send: (event) => {
					if (!event) return null;
					const properties = event.properties ?? {};
					properties.$exception_list = scrubExceptionList(properties.$exception_list);
					event.properties = properties;
					return event;
				},
			})
		: null;
	return client;
}

export async function captureServerError(
	error: unknown,
	context: { routeType?: string; routePath?: string; method: string },
): Promise<void> {
	const ph = posthog();
	if (!ph) return;
	const digest = (error as { digest?: unknown } | null)?.digest;
	try {
		await ph.captureExceptionImmediate(scrubServerError(error), "nhip-server", {
			// The route template, never the concrete path (it can carry ids and an office's slug).
			route: context.routePath,
			routeType: context.routeType,
			method: context.method,
			// The digest a user may report from an error page, kept whole to match it.
			digest: typeof digest === "string" ? digest : undefined,
			environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV,
			$process_person_profile: false,
		});
	} catch (sendError) {
		console.error("[error-tracking] could not report an error", { kind: errorKind(sendError) });
	}
}
