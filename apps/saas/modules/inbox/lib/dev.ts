export function isDevInboundEnabled(): boolean {
	return process.env.NODE_ENV !== "production";
}
