/**
 * Visual variations for the inbox walk, generated with ui-ux-pro-max and selectable at
 * runtime so they can be compared on one running server. `olive` is the current default.
 */
export const inboxStyles = ["olive", "swiss", "flat"] as const;

export type InboxStyle = (typeof inboxStyles)[number];

export const INBOX_STYLE_COOKIE = "NHIP_STYLE";

export function isInboxStyle(value: unknown): value is InboxStyle {
	return typeof value === "string" && (inboxStyles as readonly string[]).includes(value);
}

export function resolveInboxStyle(value: unknown): InboxStyle {
	return isInboxStyle(value) ? value : "olive";
}
