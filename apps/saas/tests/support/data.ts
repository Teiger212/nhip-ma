import { test } from "@playwright/test";

function stamp(): string {
	return `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/** An email no other test (or earlier run) uses. */
export function uniqueEmail(tag: string): string {
	return `e2e-${tag}-${test.info().testId}-${stamp()}@e2e.nhip.test`;
}

/** An office name no other test (or earlier run) uses. */
export function uniqueName(label: string): string {
	return `E2E ${label} ${test.info().testId} ${stamp()}`;
}
