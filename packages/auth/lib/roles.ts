/** The platform admin: Nhịp's own staff (`role` "admin", alone or in a comma list). */
export function isPlatformAdmin(role: string | null | undefined): boolean {
	return role?.split(",").includes("admin") ?? false;
}

/**
 * Whether an organization role, as Better Auth takes it (a role, a comma list or an array),
 * includes the kit's `owner`. Only the platform admin makes an office's owner (#82).
 */
export function grantsOwner(role: unknown): boolean {
	const roles = Array.isArray(role) ? role : [role];
	return roles.some(
		(entry) =>
			typeof entry === "string" &&
			entry
				.split(",")
				.map((part) => part.trim())
				.includes("owner"),
	);
}
