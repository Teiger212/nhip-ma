"use client";

import posthog from "posthog-js";
import { useEffect } from "react";

import { scrubProperties } from "../lib/scrub";

/**
 * Browser-side error tracking (PostHog Cloud): uncaught errors only, scrubbed of personal data
 * before they leave (PRODUCT.md). No session replay (it would record guests' messages), no
 * autocapture, no pageviews, no person profiles. Off unless NEXT_PUBLIC_POSTHOG_KEY is set.
 */
export function ErrorTracking() {
	useEffect(() => {
		const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
		if (!key || posthog.__loaded) return;
		posthog.init(key, {
			api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
			capture_exceptions: true,
			autocapture: false,
			capture_pageview: false,
			capture_pageleave: false,
			disable_session_recording: true,
			disable_surveys: true,
			person_profiles: "never",
			save_referrer: false,
			before_send: (event) => {
				if (!event) return null;
				// Only errors leave the browser; anything else the SDK might send is dropped.
				if (event.event !== "$exception") return null;
				event.properties = scrubProperties(event.properties) as typeof event.properties;
				return event;
			},
		});
	}, []);
	return null;
}
