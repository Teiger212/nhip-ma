"use client";

import { useEffect } from "react";

import { allowlistBrowserException } from "../lib/scrub";

/**
 * Browser-side error tracking (PostHog Cloud): uncaught errors only, rebuilt from an
 * allowlist and scrubbed before they leave (PRODUCT.md). No session replay (it would record
 * guests' messages), no autocapture, pageviews, feature-flag calls or person profiles, and
 * nothing stored on the device. Off unless NEXT_PUBLIC_POSTHOG_KEY is set, and only then is
 * the SDK downloaded: it is bundled as its own chunk (never fetched from PostHog's CDN,
 * disable_external_dependency_loading), so a page without the key never loads it.
 */
export function ErrorTracking() {
	useEffect(() => {
		const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
		if (!key) return;
		void start(key);
	}, []);
	return null;
}

async function start(key: string) {
	const [{ default: posthog }] = await Promise.all([
		import("posthog-js"),
		import("posthog-js/dist/exception-autocapture"),
	]);
	if (posthog.__loaded) return;
	posthog.init(key, {
		api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
		capture_exceptions: true,
		autocapture: false,
		capture_pageview: false,
		capture_pageleave: false,
		disable_session_recording: true,
		disable_surveys: true,
		person_profiles: "never",
		// No /flags call: it would send the stored entry URL outside before_send.
		advanced_disable_flags: true,
		save_referrer: false,
		save_campaign_params: false,
		// No cookie or localStorage identifier.
		persistence: "memory",
		disable_external_dependency_loading: true,
		before_send: (event) => {
			// Only errors leave the browser; anything else the SDK might send is dropped.
			if (!event || event.event !== "$exception") return null;
			event.properties = allowlistBrowserException(
				event.properties as Record<string, unknown>,
			) as typeof event.properties;
			delete event.$set;
			delete event.$set_once;
			return event;
		},
	});
}
